const express = require('express');
const router = express.Router();
const customerController = require('./customer.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

// CRUD
router.get('/', customerController.getAllCustomers);
router.get('/:id', customerController.getCustomerById);
router.post('/', customerController.createCustomer);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

// Special Action
router.post('/convert-lead', customerController.convertLead);

module.exports = router;
