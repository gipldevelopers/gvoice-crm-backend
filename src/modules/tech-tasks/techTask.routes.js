const express = require('express');
const router = express.Router();
const techTaskController = require('./techTask.controller');
const { authenticate, requireDepartment } = require('../../middleware/auth.middleware');
const { validateCreateBatch, validateUpdateStatus, validateSelfTask } = require('./techTask.validation');

router.use(authenticate, requireDepartment('tech'));

router.post('/batch', validateCreateBatch, techTaskController.createBatch);
router.get('/batch', techTaskController.listBatches);
router.get('/my', techTaskController.listMyTasks);
router.get('/today', techTaskController.listTodayTasks);
router.get('/user/:id/summary', techTaskController.getUserSummary);
router.post('/self', validateSelfTask, techTaskController.createSelfTask);
router.patch('/items/:id/status', validateUpdateStatus, techTaskController.updateTaskStatus);

module.exports = router;
