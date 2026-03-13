const express = require('express');
const router = express.Router();
const projectController = require('./project.controller');
const { authenticate, requireDepartment } = require('../../middleware/auth.middleware');

router.use(authenticate, requireDepartment('tech'));

router.post('/', projectController.createProject);
router.get('/', projectController.getAllProjects);
router.get('/stats', projectController.getTechDashboardStats);
router.get('/:id', projectController.getProjectById);
router.put('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);
router.post('/:id/acknowledge', projectController.acknowledgeProject);
router.post('/:id/assign-pm', projectController.assignPM);
router.post('/:id/save-plan', projectController.saveProjectPlan);
router.post('/:id/lock-plan', projectController.lockProjectPlan);

module.exports = router;
