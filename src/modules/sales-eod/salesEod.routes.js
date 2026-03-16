const express = require('express');
const router = express.Router();
const salesEodController = require('./salesEod.controller');
const { authenticate, requireDepartment } = require('../../middleware/auth.middleware');
const { validateUpsertSalesEod } = require('./salesEod.validation');

router.use(authenticate, requireDepartment('sales'));

router.get('/me', salesEodController.getMyEntry);
router.get('/me/list', salesEodController.listMyEntries);
router.get('/today-summary', salesEodController.getTodaySummary);
router.get('/user/:id/summary', salesEodController.getUserSummary);
router.post('/', validateUpsertSalesEod, salesEodController.upsertEntry);

module.exports = router;
