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
            select: { id: true, role: true, companyId: true, department: true }
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const rawRole = (user.role || '').toString().toLowerCase().trim();
        const normalizedRole = normalizeRole(user.role);
        req.user = {
            id: user.id,
            role: normalizedRole,
            rawRole,
            companyId: user.companyId,
            department: (user.department || '').toString().toLowerCase().trim(),
            isPlatformAdmin: rawRole === 'admin',
            isCompanyAdmin: normalizedRole === 'company_admin'
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

const requirePlatformAdmin = (req, res, next) => {
    if (!req.user || !req.user.isPlatformAdmin) {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    }
    return next();
};

const requireDepartment = (departments = []) => {
    if (typeof departments === 'string') {
        departments = [departments];
    }

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        if (req.user.isPlatformAdmin || req.user.isCompanyAdmin) {
            return next();
        }

        const normalizedDepartments = departments
            .filter(Boolean)
            .map((dept) => dept.toString().toLowerCase().trim());

        if (!normalizedDepartments.length) {
            return next();
        }

        if (!req.user.department || !normalizedDepartments.includes(req.user.department)) {
            return res.status(403).json({ success: false, message: 'Forbidden: Department access denied' });
        }

        return next();
    };
};

module.exports = {
    authenticate,
    authorize,
    requirePlatformAdmin,
    requireDepartment
};
