const prisma = require('../../database/prisma');

const getAllDepartments = async (companyId) => {
    return await prisma.department.findMany({
        where: { companyId },
        orderBy: { name: 'asc' }
    });
};

const createDepartment = async (companyId, data) => {
    const { name } = data;
    
    // Check if department already exists for this company
    const existing = await prisma.department.findUnique({
        where: {
            companyId_name: {
                companyId,
                name: name.trim()
            }
        }
    });

    if (existing) {
        throw new Error('Department already exists');
    }

    return await prisma.department.create({
        data: {
            name: name.trim(),
            companyId
        }
    });
};

const updateDepartment = async (id, companyId, data) => {
    const { name } = data;

    // Check existence
    const existing = await prisma.department.findFirst({
        where: { id, companyId }
    });

    if (!existing) {
        throw new Error('Department not found');
    }

    // Check if new name already exists for this company
    if (name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        const duplicate = await prisma.department.findUnique({
            where: {
                companyId_name: {
                    companyId,
                    name: name.trim()
                }
            }
        });
        if (duplicate) {
            throw new Error('Another department with this name already exists');
        }
    }

    return await prisma.department.update({
        where: { id },
        data: { name: name.trim() }
    });
};

const deleteDepartment = async (id, companyId) => {
    // Check if any users are assigned to this department name
    // Note: We are currently using string department names in User model
    const department = await prisma.department.findFirst({
        where: { id, companyId }
    });

    if (!department) {
        throw new Error('Department not found');
    }

    const userCount = await prisma.user.count({
        where: {
            companyId,
            department: department.name
        }
    });

    if (userCount > 0) {
        throw new Error('Cannot delete department as it is currently assigned to users');
    }

    return await prisma.department.delete({
        where: { id }
    });
};

module.exports = {
    getAllDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment
};
