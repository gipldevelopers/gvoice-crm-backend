const express = require('express');
const companyController = require('./company.controller');
const { authenticate, requirePlatformAdmin } = require('../../middleware/auth.middleware');

const router = express.Router();

// Publicly accessible? No, usually admin only.
router.use(authenticate, requirePlatformAdmin);

router.get('/', companyController.getAllCompanies);
router.get('/:id', companyController.getCompanyById);
router.post('/', companyController.createCompany);
router.put('/:id', companyController.updateCompany);
router.delete('/:id', companyController.deleteCompany);

module.exports = router;
