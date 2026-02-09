const prisma = require('../../database/prisma');
const bcrypt = require('bcryptjs');

const getAllEmployees = async (companyId, filters = {}) => {
    const { department, role, search } = filters;

    const where = {
        companyId: companyId
    };

    if (department && department !== 'All') {
        where.department = department;
    }

    if (role && role !== 'All') {
        where.role = { equals: role, mode: 'insensitive' };
    }

    if (search && search.trim() !== '') {
        where.OR = [
            { fullName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { department: { contains: search, mode: 'insensitive' } }
        ];
    }

    return await prisma.user.findMany({
        where,
        select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            phone: true,
            department: true,
            role: true,
            createdAt: true
        },
        orderBy: {
            fullName: 'asc'
        }
    });
};

const getEmployeeById = async (id, companyId) => {
    return await prisma.user.findFirst({
        where: { id, companyId },
        select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            phone: true,
            department: true,
            role: true,
            createdAt: true
        }
    });
};

const createEmployee = async (data) => {
    const { username, fullName, email, phone, password, department, role, companyId } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { email },
                { username }
            ]
        }
    });

    if (existingUser) {
        throw new Error('User with this email or username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    return await prisma.user.create({
        data: {
            username,
            fullName,
            email,
            phone,
            password: hashedPassword,
            department,
            role,
            companyId
        },
        select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            phone: true,
            department: true,
            role: true,
            createdAt: true
        }
    });
};

const updateEmployee = async (id, data, companyId) => {
    const { username, fullName, email, phone, password, department, role } = data;

    const updateData = {
        username,
        fullName,
        email,
        phone,
        department,
        role
    };

    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    return await prisma.user.updateMany({
        where: { id, companyId },
        data: updateData
    });
};

const deleteEmployee = async (id, companyId) => {
    return await prisma.user.deleteMany({
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
        .map(u => u.department)
        .filter(d => d && d.trim() !== "");
};

module.exports = {
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getDepartments
};
