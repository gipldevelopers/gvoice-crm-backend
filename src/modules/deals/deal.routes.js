const express = require('express');
const dealController = require('./deal.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.post('/', dealController.createDeal);
router.get('/', dealController.getAllDeals);
router.get('/:id', dealController.getDealById);
router.put('/:id', dealController.updateDeal);
router.delete('/:id', dealController.deleteDeal);

module.exports = router;
