const express = require('express');
const companyService = require('../companies/company.service');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// Get current company settings (for company_admin)
router.get('/company', authorize(['company_admin']), async (req, res) => {
    try {
        const company = await companyService.getCompanyById(req.user.companyId);
        return res.status(200).json({
            success: true,
            data: company,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// Update company settings (for company_admin)
router.put('/company', authorize(['company_admin']), async (req, res) => {
    try {
        const updatedCompany = await companyService.updateCompany(req.user.companyId, req.body);
        return res.status(200).json({
            success: true,
            message: 'Settings updated successfully',
            data: updatedCompany,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

module.exports = router;
