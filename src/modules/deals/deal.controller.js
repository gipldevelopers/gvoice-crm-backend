const dealService = require('./deal.service');

const createDeal = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const deal = await dealService.createDeal(req.body, companyId);
        res.status(201).json({ success: true, data: deal });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const getAllDeals = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const filters = {
            search: req.query.search,
            stage: req.query.stage,
            salespersonId: req.query.salespersonId,
        };
        const deals = await dealService.getAllDeals(companyId, filters);
        res.status(200).json({ success: true, data: deals });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getDealById = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        const deal = await dealService.getDealById(id, companyId);
        res.status(200).json({ success: true, data: deal });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

const updateDeal = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        const deal = await dealService.updateDeal(id, req.body, companyId);
        res.status(200).json({ success: true, data: deal });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deleteDeal = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        await dealService.deleteDeal(id, companyId);
        res.status(200).json({ success: true, message: 'Deal deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

module.exports = {
    createDeal,
    getAllDeals,
    getDealById,
    updateDeal,
    deleteDeal
};
