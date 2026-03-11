const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.get('/stats', authenticate, dashboardController.getStats);
router.get('/trends', authenticate, dashboardController.getTrends);
router.get('/activities', authenticate, dashboardController.getActivities);

module.exports = router;
