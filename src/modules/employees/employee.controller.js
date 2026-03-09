const employeeService = require('./employee.service');

const getEmployees = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { department, role, search, managerId } = req.query;
        const employees = await employeeService.getAllEmployees(companyId, { department, role, search, managerId });
        res.status(200).json({ success: true, data: employees });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
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
        const companyId = req.user.companyId;
        const employeeData = { ...req.body, companyId };

        const employee = await employeeService.createEmployee(employeeData);
        res.status(201).json({ success: true, data: employee });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;

        const result = await employeeService.updateEmployee(id, req.body, companyId);

        if (result.count === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        res.status(200).json({ success: true, message: 'Employee updated successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;

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
        const companyId = req.user.companyId;
        const departments = await employeeService.getDepartments(companyId);
        res.status(200).json({ success: true, data: departments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getHierarchy = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const hierarchy = await employeeService.getHierarchy(companyId);
        res.status(200).json({ success: true, data: hierarchy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getPotentialManagers = async (req, res) => {
    try {
        const companyId = req.user.companyId;
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
    deleteEmployee,
    getDepartments,
    getHierarchy,
    getPotentialManagers
};
