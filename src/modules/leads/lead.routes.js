const express = require('express');
const router = express.Router();
const leadController = require('./lead.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

// Create a new lead
router.post('/', leadController.createLead);

// Get all leads with optional filters
router.get('/', leadController.getAllLeads);

// Get claim request activities for current user
router.get('/claim-activities', leadController.getClaimActivities);
router.get('/approval-activities', leadController.getApprovalActivities);
router.post('/dev/email-test', leadController.sendDevEmailTemplate);

// Get lead statistics
router.get('/stats', leadController.getLeadStats);

// Get leads by salesperson
router.get('/salesperson/:salespersonId', leadController.getLeadsBySalesperson);

// Get a single lead by ID
router.get('/:id', leadController.getLeadById);

// Update a lead
router.put('/:id', leadController.updateLead);

// Delete a lead
router.delete('/:id', leadController.deleteLead);

// Assign a lead
router.patch('/:id/assign', leadController.assignLead);

// Request lead claim (creates approval task for lead owner/admin)
router.patch('/:id/claim-request', leadController.requestClaim);
router.patch('/:id/extension-request', leadController.requestExtension);
router.patch('/claim-requests/:taskId/decision', leadController.decideClaimRequest);
router.patch('/approval-requests/:taskId/decision', leadController.decideApprovalRequest);
router.patch('/:id/dev-force-claim-open', leadController.forceClaimOpenForTesting);

// Update lead status
router.patch('/:id/status', leadController.updateStatus);

module.exports = router;
