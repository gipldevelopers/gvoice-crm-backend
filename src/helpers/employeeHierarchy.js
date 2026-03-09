const EMPLOYEE_ROLES = {
    COMPANY_ADMIN: 'company_admin',
    HEAD_OF_DEPARTMENT: 'head_of_department',
    TEAM_LEADER: 'team_leader',
    EMPLOYEE: 'employee'
};

const LEGACY_ROLE_ALIASES = {
    admin: EMPLOYEE_ROLES.COMPANY_ADMIN,
    manager: EMPLOYEE_ROLES.TEAM_LEADER,
    user: EMPLOYEE_ROLES.EMPLOYEE,
    staff: EMPLOYEE_ROLES.EMPLOYEE
};

const ROLE_LABELS = {
    [EMPLOYEE_ROLES.COMPANY_ADMIN]: 'Company Admin',
    [EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT]: 'Head of Department',
    [EMPLOYEE_ROLES.TEAM_LEADER]: 'Team Leader',
    [EMPLOYEE_ROLES.EMPLOYEE]: 'Employee'
};

const normalizeRole = (role) => {
    if (!role || typeof role !== 'string') return EMPLOYEE_ROLES.EMPLOYEE;
    const lowered = role.trim().toLowerCase();
    return LEGACY_ROLE_ALIASES[lowered] || lowered;
};

const isCompanyAdminRole = (role) => normalizeRole(role) === EMPLOYEE_ROLES.COMPANY_ADMIN;

const canAccessEmployees = (role) => {
    const normalized = normalizeRole(role);
    return [
        EMPLOYEE_ROLES.COMPANY_ADMIN,
        EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT,
        EMPLOYEE_ROLES.TEAM_LEADER
    ].includes(normalized);
};

module.exports = {
    EMPLOYEE_ROLES,
    ROLE_LABELS,
    normalizeRole,
    isCompanyAdminRole,
    canAccessEmployees
};
