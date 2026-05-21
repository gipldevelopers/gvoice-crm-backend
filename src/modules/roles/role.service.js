// Scoped role management service
const prisma = require('../../database/prisma');

const getAllRoles = async (companyId) => {
    return await prisma.role.findMany({
        where: { companyId },
        orderBy: { name: 'asc' }
    });
};

const createRole = async (companyId, data) => {
    const { name, baseRole, department } = data;
    
    // Check if role already exists for this company and department
    const existing = await prisma.role.findFirst({
        where: {
            companyId,
            name: { equals: name.trim(), mode: 'insensitive' },
            department: department ? { equals: department.trim(), mode: 'insensitive' } : null
        }
    });

    if (existing) {
        throw new Error('Role with this name already exists in this department');
    }

    return await prisma.role.create({
        data: {
            name: name.trim(),
            baseRole: baseRole || 'employee',
            department: department ? department.trim() : null,
            companyId
        }
    });
};

const updateRole = async (id, companyId, data) => {
    const { name, baseRole, department } = data;

    // Check existence
    const existing = await prisma.role.findFirst({
        where: { id, companyId }
    });

    if (!existing) {
        throw new Error('Role not found');
    }

    // Check if new name already exists for this company and department
    if (name && (name.trim().toLowerCase() !== existing.name.toLowerCase() || (department !== undefined && (department || "").toLowerCase() !== (existing.department || "").toLowerCase()))) {
        const checkDept = department !== undefined ? department : existing.department;
        const duplicate = await prisma.role.findFirst({
            where: {
                companyId,
                name: { equals: name.trim(), mode: 'insensitive' },
                department: checkDept ? { equals: checkDept.trim(), mode: 'insensitive' } : null
            }
        });
        if (duplicate) {
            throw new Error('Another role with this name already exists in this department');
        }
    }

    return await prisma.role.update({
        where: { id },
        data: { 
            ...(name && { name: name.trim() }),
            ...(baseRole && { baseRole }),
            ...(department !== undefined && { department: department ? department.trim() : null })
        }
    });
};

const deleteRole = async (id, companyId) => {
    const role = await prisma.role.findFirst({
        where: { id, companyId }
    });

    if (!role) {
        throw new Error('Role not found');
    }

    // Check if any users are assigned to this role name
    const userCount = await prisma.user.count({
        where: {
            companyId,
            role: role.name
        }
    });

    if (userCount > 0) {
        throw new Error('Cannot delete role as it is currently assigned to users');
    }

    return await prisma.role.delete({
        where: { id }
    });
};

module.exports = {
    getAllRoles,
    createRole,
    updateRole,
    deleteRole
};
