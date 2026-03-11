const express = require('express');
const router = express.Router();
const projectController = require('./project.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

router.post('/', projectController.createProject);
router.get('/', projectController.getAllProjects);
router.get('/my-tasks', projectController.getMyTasks);               // My assigned tasks
router.get('/:id', projectController.getProjectById);
router.put('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);
router.post('/:id/acknowledge', projectController.acknowledgeProject);
router.post('/:id/assign-pm', projectController.assignPM);
router.post('/:id/save-plan', projectController.saveProjectPlan);
router.post('/:id/lock-plan', projectController.lockProjectPlan);
router.get('/:id/tasks', projectController.getProjectTasks);          // All tasks for a project
router.post('/tasks/:taskId/accept', projectController.acceptTask);   // Accept a task
router.patch('/tasks/:taskId/status', projectController.updateTaskStatus); // Update task status
router.post('/escalate-check', projectController.checkEscalations);  // Trigger escalation check

module.exports = router;
