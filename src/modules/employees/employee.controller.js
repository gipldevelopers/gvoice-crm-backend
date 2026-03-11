const employeeService = require('./employee.service');

const getEmployees = async (req, res) => {
    try {
        // If it's a global admin (admin), they can see all companies or filter.
        // Company admins are restricted to their own companyId.
        let targetCompanyId = req.user.companyId;
        if (req.user.rawRole === 'admin') {
            targetCompanyId = req.query.companyId || 'all';
        }

        const filters = {
            companyId: targetCompanyId,
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
        const companyId = req.user.rawRole === 'admin' ? null : req.user.companyId;
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
        // Determine target company: prioritise body for super-admins, fallback to current user's company
        let targetCompanyId = req.body.companyId;
        if (!targetCompanyId || req.user.rawRole !== 'admin') {
            targetCompanyId = req.user.companyId;
        }

        if (!targetCompanyId) {
            return res.status(400).json({ success: false, message: 'companyId is required' });
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
        const companyId = req.user.rawRole === 'admin' ? null : req.user.companyId;

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
        const where = { id };
        if (req.user.rawRole !== 'admin') {
            where.companyId = req.user.companyId;
        }

        const updated = await prisma.user.updateMany({
            where,
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
        const companyId = req.user.rawRole === 'admin' ? null : req.user.companyId;

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
        const companyId = req.user.rawRole === 'admin'
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
        const companyId = req.user.rawRole === 'admin'
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
        const companyId = req.user.rawRole === 'admin'
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
