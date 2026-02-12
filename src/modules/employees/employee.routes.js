const express = require('express');
const employeeController = require('./employee.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', employeeController.getEmployees);
router.get('/departments', employeeController.getDepartments);
router.get('/hierarchy', employeeController.getHierarchy);
router.get('/managers', employeeController.getPotentialManagers);
router.get('/:id', employeeController.getEmployee);
router.post('/', employeeController.createEmployee);
router.put('/:id', employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;
