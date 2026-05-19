const roleService = require('./role.service');

const getRoles = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const roles = await roleService.getAllRoles(companyId);
        res.status(200).json({ success: true, data: roles });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const createRole = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const role = await roleService.createRole(companyId, req.body);
        res.status(201).json({ success: true, data: role });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        const role = await roleService.updateRole(id, companyId, req.body);
        res.status(200).json({ success: true, data: role });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deleteRole = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        await roleService.deleteRole(id, companyId);
        res.status(200).json({ success: true, message: 'Role deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

module.exports = {
    getRoles,
    createRole,
    updateRole,
    deleteRole
};
