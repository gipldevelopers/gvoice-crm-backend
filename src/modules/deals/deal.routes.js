const express = require('express');
const dealController = require('./deal.controller');
const { authenticate, requireDepartment } = require('../../middleware/auth.middleware');
const { dealDocumentUpload } = require('../../middleware/upload');

const router = express.Router();

router.use(authenticate, requireDepartment('sales'));

router.post('/', dealController.createDeal);
router.get('/', dealController.getAllDeals);
router.get('/:id', dealController.getDealById);
router.put('/:id', dealController.updateDeal);
router.delete('/:id', dealController.deleteDeal);

// Documents
router.post('/:id/documents', dealDocumentUpload.array('files'), dealController.uploadDocuments);
router.get('/:id/documents', dealController.getDocuments);
router.delete('/:id/documents/:documentId', dealController.deleteDocument);

// Compliance Approvals
router.post('/:id/compliance/submit', dealController.submitCompliance);
router.post('/:id/compliance/approve', dealController.approveCompliance);

module.exports = router;
