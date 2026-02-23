const prisma = require('../../database/prisma');
const bcrypt = require('bcryptjs');
const {
    EMPLOYEE_ROLES,
    ROLE_LABELS,
    normalizeRole
} = require('../../helpers/employeeHierarchy');

const EMPLOYEE_SELECT = {
    id: true,
    username: true,
    fullName: true,
    email: true,
    phone: true,
    department: true,
    teamName: true,
    role: true,
    reportsToId: true,
    reportsTo: {
        select: {
            id: true,
            fullName: true,
            role: true
        }
    },
    _count: {
        select: {
            directReports: true
        }
    },
    createdAt: true
};

const ROLE_FILTER_ALIASES = {
    [EMPLOYEE_ROLES.COMPANY_ADMIN]: ['company_admin', 'admin'],
    [EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT]: ['head_of_department'],
    [EMPLOYEE_ROLES.TEAM_LEADER]: ['team_leader', 'manager'],
    [EMPLOYEE_ROLES.EMPLOYEE]: ['employee', 'user', 'staff']
};

const resolveTeamNameForUser = ({ role, inputTeamName, reportingManager }) => {
    const normalizedRole = normalizeRole(role);

    if (normalizedRole === EMPLOYEE_ROLES.TEAM_LEADER) {
        return inputTeamName || null;
    }

    if (normalizedRole === EMPLOYEE_ROLES.EMPLOYEE) {
        const managerRole = normalizeRole(reportingManager?.role);
        if (managerRole === EMPLOYEE_ROLES.TEAM_LEADER) {
            return reportingManager?.teamName || null;
        }
        return null;
    }

    return null;
};

const getRoleFilterValues = (inputRole) => {
    const normalized = normalizeRole(inputRole);
    return ROLE_FILTER_ALIASES[normalized] || [normalized];
};

const mapEmployee = (employee) => {
    const normalizedRole = normalizeRole(employee.role);
    return {
        ...employee,
        role: normalizedRole,
        roleLabel: ROLE_LABELS[normalizedRole] || normalizedRole,
        reportsTo: employee.reportsTo
            ? {
                ...employee.reportsTo,
                role: normalizeRole(employee.reportsTo.role),
                roleLabel: ROLE_LABELS[normalizeRole(employee.reportsTo.role)] || normalizeRole(employee.reportsTo.role)
            }
            : null
    };
};

const ensureSingleDepartmentHead = async ({ companyId, department, excludeUserId = null }) => {
    if (!department || !department.trim()) return;

    const existingHead = await prisma.user.findFirst({
        where: {
            companyId,
            department: department.trim(),
            role: { equals: EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT, mode: 'insensitive' },
            ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
        },
        select: { id: true, fullName: true },
    });

    if (existingHead) {
        throw new Error(`Only one Head of Department is allowed in "${department}". Existing HoD: ${existingHead.fullName}`);
    }
};

const validateReportingStructure = async ({
    companyId,
    role,
    department,
    reportsToId,
    employeeId = null
}) => {
    const normalizedRole = normalizeRole(role);

    if (normalizedRole !== EMPLOYEE_ROLES.COMPANY_ADMIN && (!department || !department.trim())) {
        throw new Error('Department is required for this role');
    }

    if (!reportsToId) {
        if (normalizedRole === EMPLOYEE_ROLES.EMPLOYEE) {
            throw new Error('Employee must be assigned under a Team Leader');
        }
        return null;
    }

    if (employeeId && reportsToId === employeeId) {
        throw new Error('Employee cannot report to themselves');
    }

    const manager = await prisma.user.findFirst({
        where: { id: reportsToId, companyId },
        select: { id: true, fullName: true, role: true, department: true, teamName: true }
    });

    if (!manager) {
        throw new Error('Selected reporting manager was not found in this company');
    }

    const managerRole = normalizeRole(manager.role);

    if (normalizedRole === EMPLOYEE_ROLES.COMPANY_ADMIN) {
        throw new Error('Company Admin cannot have a reporting manager');
    }

    if (normalizedRole === EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT) {
        if (![EMPLOYEE_ROLES.COMPANY_ADMIN].includes(managerRole)) {
            throw new Error('Head of Department can report only to Company Admin');
        }
        return manager;
    }

    if (normalizedRole === EMPLOYEE_ROLES.TEAM_LEADER) {
        if (![EMPLOYEE_ROLES.COMPANY_ADMIN, EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT].includes(managerRole)) {
            throw new Error('Team Leader can report only to Company Admin or Head of Department');
        }
        return manager;
    }

    if (normalizedRole === EMPLOYEE_ROLES.EMPLOYEE) {
        if (
            ![
                EMPLOYEE_ROLES.TEAM_LEADER,
                EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT,
                EMPLOYEE_ROLES.COMPANY_ADMIN
            ].includes(managerRole)
        ) {
            throw new Error('Employee can report only to Team Leader, Head of Department, or Company Admin');
        }
        return manager;
    }

    return manager;
};

const getAllEmployees = async (companyId, filters = {}) => {
    const { department, role, search, managerId } = filters;

    const where = { companyId };
    const andConditions = [];

    if (department && department !== 'All') {
        where.department = department;
    }

    if (role && role !== 'All') {
        const roleValues = getRoleFilterValues(role);
        andConditions.push({
            OR: roleValues.map((value) => ({
                role: { equals: value, mode: 'insensitive' }
            }))
        });
    }

    if (managerId) {
        where.reportsToId = managerId;
    }

    if (search && search.trim() !== '') {
        andConditions.push({
            OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { department: { contains: search, mode: 'insensitive' } },
                { teamName: { contains: search, mode: 'insensitive' } },
                { reportsTo: { is: { fullName: { contains: search, mode: 'insensitive' } } } }
            ]
        });
    }

    if (andConditions.length) {
        where.AND = andConditions;
    }

    const employees = await prisma.user.findMany({
        where,
        select: EMPLOYEE_SELECT,
        orderBy: { fullName: 'asc' }
    });

    return employees.map(mapEmployee);
};

const getEmployeeById = async (id, companyId) => {
    const employee = await prisma.user.findFirst({
        where: { id, companyId },
        select: EMPLOYEE_SELECT
    });

    return employee ? mapEmployee(employee) : null;
};

const createEmployee = async (data) => {
    const {
        username,
        fullName,
        email,
        phone,
        password,
        department,
        teamName,
        role,
        reportsToId,
        companyId
    } = data;

    const normalizedRole = normalizeRole(role);

    if (normalizedRole === EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT) {
        await ensureSingleDepartmentHead({
            companyId,
            department,
        });
    }

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { username }]
        }
    });

    if (existingUser) {
        throw new Error('User with this email or username already exists');
    }

    const reportingManager = await validateReportingStructure({
        companyId,
        role: normalizedRole,
        department,
        reportsToId
    });

    if (normalizedRole === EMPLOYEE_ROLES.TEAM_LEADER && (!teamName || !teamName.trim())) {
        throw new Error('Team name is required for Team Leader');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const employee = await prisma.user.create({
        data: {
            username: username.trim(),
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone || null,
            password: hashedPassword,
            department: normalizedRole === EMPLOYEE_ROLES.COMPANY_ADMIN ? null : (department || null),
            teamName: resolveTeamNameForUser({
                role: normalizedRole,
                inputTeamName: teamName,
                reportingManager
            }),
            role: normalizedRole,
            reportsToId: reportsToId || null,
            companyId
        },
        select: EMPLOYEE_SELECT
    });

    return mapEmployee(employee);
};

const updateEmployee = async (id, data, companyId) => {
    const {
        username,
        fullName,
        email,
        phone,
        password,
        department,
        teamName,
        role,
        reportsToId
    } = data;

    const existing = await prisma.user.findFirst({
        where: { id, companyId },
        select: { id: true, role: true, email: true, username: true }
    });

    if (!existing) {
        return { count: 0 };
    }

    const normalizedRole = normalizeRole(role || existing.role);
    const normalizedDepartment = normalizedRole === EMPLOYEE_ROLES.COMPANY_ADMIN ? null : (department || null);
    const normalizedManagerId = reportsToId === '' ? null : reportsToId;

    if (normalizedRole === EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT) {
        await ensureSingleDepartmentHead({
            companyId,
            department: normalizedDepartment,
            excludeUserId: id,
        });
    }

    const reportingManager = await validateReportingStructure({
        companyId,
        role: normalizedRole,
        department: normalizedDepartment,
        reportsToId: normalizedManagerId,
        employeeId: id
    });

    if (normalizedRole === EMPLOYEE_ROLES.TEAM_LEADER && (!teamName || !teamName.trim())) {
        throw new Error('Team name is required for Team Leader');
    }

    if (email && email.trim().toLowerCase() !== existing.email) {
        const duplicateEmail = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
            select: { id: true }
        });
        if (duplicateEmail && duplicateEmail.id !== id) {
            throw new Error('User with this email already exists');
        }
    }

    if (username && username.trim() !== existing.username) {
        const duplicateUsername = await prisma.user.findUnique({
            where: { username: username.trim() },
            select: { id: true }
        });
        if (duplicateUsername && duplicateUsername.id !== id) {
            throw new Error('User with this username already exists');
        }
    }

    const resolvedTeamName = resolveTeamNameForUser({
        role: normalizedRole,
        inputTeamName: teamName,
        reportingManager
    });

    const updateData = {
        username: username?.trim(),
        fullName: fullName?.trim(),
        email: email?.trim().toLowerCase(),
        phone: phone ?? null,
        department: normalizedDepartment,
        teamName: resolvedTeamName,
        role: normalizedRole,
        reportsToId: normalizedManagerId || null
    };

    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedEmployee = await prisma.user.update({
        where: { id },
        data: updateData,
        select: EMPLOYEE_SELECT
    });

    if (
        normalizeRole(existing.role) === EMPLOYEE_ROLES.TEAM_LEADER &&
        normalizedRole === EMPLOYEE_ROLES.TEAM_LEADER
    ) {
        await prisma.user.updateMany({
            where: {
                companyId,
                reportsToId: id,
                OR: [
                    { role: { equals: EMPLOYEE_ROLES.EMPLOYEE, mode: 'insensitive' } },
                    { role: { equals: 'user', mode: 'insensitive' } },
                    { role: { equals: 'staff', mode: 'insensitive' } }
                ]
            },
            data: {
                teamName: resolvedTeamName
            }
        });
    }

    return { count: 1, data: mapEmployee(updatedEmployee) };
};

const deleteEmployee = async (id, companyId) => {
    await prisma.user.updateMany({
        where: { companyId, reportsToId: id },
        data: { reportsToId: null }
    });

    return prisma.user.deleteMany({
        where: { id, companyId }
    });
};

const getDepartments = async (companyId) => {
    const users = await prisma.user.findMany({
        where: { companyId },
        select: { department: true },
        distinct: ['department']
    });
    return users
        .map((u) => u.department)
        .filter((d) => d && d.trim() !== '');
};

const getHierarchy = async (companyId) => {
    const users = await prisma.user.findMany({
        where: { companyId },
        select: {
            id: true,
            fullName: true,
            role: true,
            department: true,
            teamName: true,
            reportsToId: true
        },
        orderBy: { fullName: 'asc' }
    });

    const normalizedUsers = users.map((user) => ({
        ...user,
        role: normalizeRole(user.role),
        roleLabel: ROLE_LABELS[normalizeRole(user.role)] || normalizeRole(user.role)
    }));

    const companyAdmins = normalizedUsers.filter((u) => u.role === EMPLOYEE_ROLES.COMPANY_ADMIN);
    const departmentsMap = {};

    normalizedUsers
        .filter((u) => u.department)
        .forEach((u) => {
            if (!departmentsMap[u.department]) {
                departmentsMap[u.department] = {
                    department: u.department,
                    heads: [],
                    teamLeaders: [],
                    employeesWithoutTeamLeader: []
                };
            }

            if (u.role === EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT) {
                departmentsMap[u.department].heads.push(u);
            } else if (u.role === EMPLOYEE_ROLES.TEAM_LEADER) {
                departmentsMap[u.department].teamLeaders.push({ ...u, teamMembers: [] });
            } else if (u.role === EMPLOYEE_ROLES.EMPLOYEE) {
                departmentsMap[u.department].employeesWithoutTeamLeader.push(u);
            }
        });

    Object.values(departmentsMap).forEach((department) => {
        const leaderMap = new Map(department.teamLeaders.map((leader) => [leader.id, leader]));
        department.employeesWithoutTeamLeader = department.employeesWithoutTeamLeader.filter((employee) => {
            if (employee.reportsToId && leaderMap.has(employee.reportsToId)) {
                leaderMap.get(employee.reportsToId).teamMembers.push(employee);
                return false;
            }
            return true;
        });
    });

    return {
        companyAdmins,
        departments: Object.values(departmentsMap).sort((a, b) => a.department.localeCompare(b.department))
    };
};

const getPotentialManagers = async (companyId, filters = {}) => {
    const {
        role = EMPLOYEE_ROLES.EMPLOYEE,
        department = null,
        excludeId = null
    } = filters;

    const normalizedRole = normalizeRole(role);

    if (normalizedRole === EMPLOYEE_ROLES.COMPANY_ADMIN) {
        return [];
    }

    const managerRolesByTargetRole = {
        [EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT]: [EMPLOYEE_ROLES.COMPANY_ADMIN],
        [EMPLOYEE_ROLES.TEAM_LEADER]: [EMPLOYEE_ROLES.COMPANY_ADMIN, EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT],
        [EMPLOYEE_ROLES.EMPLOYEE]: [EMPLOYEE_ROLES.TEAM_LEADER, EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT, EMPLOYEE_ROLES.COMPANY_ADMIN]
    };

    const allowedManagerRoles = managerRolesByTargetRole[normalizedRole] || [];
    if (!allowedManagerRoles.length) return [];

    const roleConditions = allowedManagerRoles.flatMap((roleValue) =>
        getRoleFilterValues(roleValue).map((alias) => ({ role: { equals: alias, mode: 'insensitive' } }))
    );

    const where = {
        companyId,
        OR: roleConditions
    };

    if (excludeId) {
        where.NOT = { id: excludeId };
    }

    const managers = await prisma.user.findMany({
        where,
        select: {
            id: true,
            fullName: true,
            role: true,
            department: true,
            teamName: true
        },
        orderBy: { fullName: 'asc' }
    });

    return managers.map((manager) => ({
        ...manager,
        role: normalizeRole(manager.role),
        roleLabel: ROLE_LABELS[normalizeRole(manager.role)] || normalizeRole(manager.role)
    }));
};

module.exports = {
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getDepartments,
    getHierarchy,
    getPotentialManagers
};
