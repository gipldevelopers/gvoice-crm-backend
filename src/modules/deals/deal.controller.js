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
            customerId: req.query.customerId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            minValue: req.query.minValue,
            maxValue: req.query.maxValue,
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 10,
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

const uploadDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        const uploadedBy = req.user.id;
        const { documentType } = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files provided' });
        }
        if (!documentType) {
            return res.status(400).json({ success: false, message: 'Document type is required' });
        }

        const result = await dealService.uploadDocuments({
            dealId: id,
            companyId,
            documentType,
            files,
            uploadedBy
        });

        res.status(201).json({ success: true, message: 'Documents uploaded successfully', data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const { documentType } = req.query;
        const companyId = req.user.companyId;

        const documents = await dealService.getDocuments(id, companyId, documentType);
        res.status(200).json({ success: true, data: documents });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const deleteDocument = async (req, res) => {
    try {
        const { id, documentId } = req.params;
        const companyId = req.user.companyId;

        await dealService.deleteDocument(id, documentId, companyId);
        res.status(200).json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const submitCompliance = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        const userId = req.user.id;

        const result = await dealService.submitCompliance(id, companyId, userId);
        res.status(200).json({ success: true, message: 'Compliance flow started successfully', data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const approveCompliance = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        const userId = req.user.id;
        const { level, action, comments } = req.body; // action: "APPROVED" or "REJECTED"

        const result = await dealService.approveCompliance({
            dealId: id,
            companyId,
            userId,
            level,
            action,
            comments
        });
        res.status(200).json({ success: true, message: `Compliance ${action.toLowerCase()} successfully`, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

module.exports = {
    createDeal,
    getAllDeals,
    getDealById,
    updateDeal,
    deleteDeal,
    uploadDocuments,
    getDocuments,
    deleteDocument,
    submitCompliance,
    approveCompliance
};
