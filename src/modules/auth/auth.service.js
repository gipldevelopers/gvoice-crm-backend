const prisma = require('../../database/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { normalizeRole } = require('../../helpers/employeeHierarchy');

const login = async (identifier, password) => {
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: identifier },
                { username: identifier }
            ]
        },
        include: { company: true }
    });

    if (!user) {
        throw new Error('Invalid email, username or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        throw new Error('Invalid email or password');
    }

    const token = jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: normalizeRole(user.role),
            companyId: user.companyId
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Update token in DB (optional, but requested in schema)
    await prisma.user.update({
        where: { id: user.id },
        data: { token }
    });

    return {
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            username: user.username,
            phone: user.phone,
            department: user.department,
            teamName: user.teamName,
            role: normalizeRole(user.role),
            company: user.company
        },
        token
    };
};

const getUserById = async (id) => {
    const user = await prisma.user.findUnique({
        where: { id },
        include: { company: true }
    });

    if (!user) {
        throw new Error('User not found');
    }

    // Don't return sensitive data
    const { password, token, ...safeUser } = user;
    return { ...safeUser, role: normalizeRole(safeUser.role) };
};

module.exports = {
    login,
    getUserById
};
