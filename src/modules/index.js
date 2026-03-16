const express = require('express');
const router = express.Router();

// Import routes
const demoRoutes = require('./demo/demo.routes');
const authRoutes = require('./auth/auth.routes');
const leadRoutes = require('./leads/lead.routes');
const employeeRoutes = require('./employees/employee.routes');
const customerRoutes = require('./customers/customer.routes');
const taskRoutes = require('./tasks/task.routes');
const dealRoutes = require('./deals/deal.routes');
const dashboardRoutes = require('./dashboard/dashboard.routes');
const googleRoutes = require('./google/google.routes');
const projectRoutes = require('./projects/project.routes');
const companyRoutes = require('./companies/company.routes');
const eodRoutes = require('./eod/eod.routes');
const techTaskRoutes = require('./tech-tasks/techTask.routes');
const salesEodRoutes = require('./sales-eod/salesEod.routes');

// Define routes

router.use('/auth', authRoutes);
router.use('/leads', leadRoutes);
router.use('/employees', employeeRoutes);
router.use('/customers', customerRoutes);
router.use('/tasks', taskRoutes);
router.use('/deals', dealRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/google', googleRoutes);
router.use('/projects', projectRoutes);
router.use('/companies', companyRoutes);
router.use('/eod', eodRoutes);
router.use('/tech-tasks', techTaskRoutes);
router.use('/sales-eod', salesEodRoutes);


module.exports = router;
