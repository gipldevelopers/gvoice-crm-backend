const express = require('express');
const router = express.Router();
const leadController = require('./lead.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

// Create a new lead
router.post('/', leadController.createLead);

// Get all leads with optional filters
router.get('/', leadController.getAllLeads);

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

// Update lead status
router.patch('/:id/status', leadController.updateStatus);

module.exports = router;
