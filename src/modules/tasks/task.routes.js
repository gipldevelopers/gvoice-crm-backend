const express = require('express');
const router = express.Router();
const taskController = require('./task.controller');
const { authenticate, requireDepartment } = require('../../middleware/auth.middleware');
const { validateCreateTask, validateUpdateTask } = require('./task.validation');

// Apply auth middleware to all routes
router.use(authenticate, requireDepartment('sales'));

// CRUD routes
router.post('/', validateCreateTask, taskController.createTask);
router.get('/', taskController.getAllTasks);
router.get('/stats', taskController.getTaskStats);
router.get('/filters', taskController.getFilterOptions);
router.get('/entities/:entityType', taskController.getEntities);
router.get('/:id', taskController.getTaskById);
router.put('/:id', validateUpdateTask, taskController.updateTask);
router.delete('/:id', taskController.deleteTask);

module.exports = router;
