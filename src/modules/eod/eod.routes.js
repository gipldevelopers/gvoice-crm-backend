const express = require('express');
const router = express.Router();
const eodController = require('./eod.controller');
const { authenticate, requireDepartment } = require('../../middleware/auth.middleware');
const { validateUpsertEod } = require('./eod.validation');

router.use(authenticate, requireDepartment('tech'));

router.get('/defaults', eodController.getDefaultTasks);
router.get('/me', eodController.getMyEntry);
router.get('/me/list', eodController.listMyEntries);
router.post('/', validateUpsertEod, eodController.upsertEntry);

module.exports = router;
