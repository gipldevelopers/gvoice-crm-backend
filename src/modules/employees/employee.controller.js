const employeeService = require('./employee.service');

const getEmployees = async (req, res) => {
    try {
        // If it's a global admin or company admin, they can see all companies or filter by one
        const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'company_admin';

        const filters = {
            companyId: isGlobalAdmin ? (req.query.companyId || 'all') : req.user.companyId,
            department: req.query.department,
            role: req.query.role,
            status: req.query.status,
            search: req.query.search,
            managerId: req.query.managerId,
            page: req.query.page,
            limit: req.query.limit
        };

        const result = await employeeService.getAllEmployees(filters);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'company_admin';
        const companyId = isGlobalAdmin ? null : req.user.companyId;
        const employee = await employeeService.getEmployeeById(id, companyId);

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const createEmployee = async (req, res) => {
    try {
        const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'company_admin';
        // For global admin, use companyId from body. For others, use their own companyId.
        const targetCompanyId = isGlobalAdmin ? req.body.companyId : req.user.companyId;

        if (!targetCompanyId) {
            throw new Error('companyId is required');
        }

        const employeeData = { ...req.body, companyId: targetCompanyId };

        const employee = await employeeService.createEmployee(employeeData);
        res.status(201).json({ success: true, data: employee });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'company_admin';
        const companyId = isGlobalAdmin ? null : req.user.companyId;

        const result = await employeeService.updateEmployee(id, req.body, companyId);

        if (result.count === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        res.status(200).json({ success: true, message: 'Employee updated successfully', data: result.data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const patchEmployeeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value.' });
        }

        const prisma = require('../../database/prisma');
        const updated = await prisma.user.updateMany({
            where: { id },
            data: { status }
        });

        if (updated.count === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        res.status(200).json({ success: true, message: `Status updated to ${status}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'company_admin';
        const companyId = isGlobalAdmin ? null : req.user.companyId;

        const result = await employeeService.deleteEmployee(id, companyId);

        if (result.count === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        res.status(200).json({ success: true, message: 'Employee deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getDepartments = async (req, res) => {
    try {
        const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'company_admin';
        const companyId = isGlobalAdmin
            ? (req.query.companyId || req.user.companyId)
            : req.user.companyId;

        const departments = await employeeService.getDepartments(companyId);
        res.status(200).json({ success: true, data: departments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getHierarchy = async (req, res) => {
    try {
        const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'company_admin';
        const companyId = isGlobalAdmin
            ? (req.query.companyId || req.user.companyId)
            : req.user.companyId;

        const hierarchy = await employeeService.getHierarchy(companyId);
        res.status(200).json({ success: true, data: hierarchy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getPotentialManagers = async (req, res) => {
    try {
        const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'company_admin';
        const companyId = isGlobalAdmin
            ? (req.query.companyId || req.user.companyId)
            : req.user.companyId;
        const { role, department, excludeId } = req.query;
        const managers = await employeeService.getPotentialManagers(companyId, { role, department, excludeId });
        res.status(200).json({ success: true, data: managers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    patchEmployeeStatus,
    deleteEmployee,
    getDepartments,
    getHierarchy,
    getPotentialManagers
};
