const express = require('express');
const router = express.Router();
const activityLogController = require('./activityLog.controller');
const { authenticate } = require('../../middleware/auth.middleware');

// All activity log routes require authentication
router.use(authenticate);

router.get('/', activityLogController.getActivityLogs);

module.exports = router;
