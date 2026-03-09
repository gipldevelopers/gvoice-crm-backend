const jwt = require('jsonwebtoken');
const prisma = require('../database/prisma');
const { normalizeRole } = require('../helpers/employeeHierarchy');

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Verify user exists in DB
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, role: true, companyId: true }
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        req.user = {
            id: user.id,
            role: normalizeRole(user.role),
            rawRole: user.role,
            companyId: user.companyId
        };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
    }
};

const authorize = (roles = []) => {
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return (req, res, next) => {
        if (!req.user || (roles.length && !roles.includes(req.user.role))) {
            return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
        }
        next();
    };
};

module.exports = {
    authenticate,
    authorize
};
