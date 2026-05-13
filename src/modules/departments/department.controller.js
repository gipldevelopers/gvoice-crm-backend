const departmentService = require('./department.service');

const getDepartments = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const departments = await departmentService.getAllDepartments(companyId);
        res.status(200).json({ success: true, data: departments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const createDepartment = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const department = await departmentService.createDepartment(companyId, req.body);
        res.status(201).json({ success: true, data: department });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        const department = await departmentService.updateDepartment(id, companyId, req.body);
        res.status(200).json({ success: true, data: department });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        await departmentService.deleteDepartment(id, companyId);
        res.status(200).json({ success: true, message: 'Department deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

module.exports = {
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment
};
