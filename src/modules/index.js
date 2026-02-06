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

// Define routes
router.use('/demo', demoRoutes);
router.use('/auth', authRoutes);
router.use('/leads', leadRoutes);
router.use('/employees', employeeRoutes);
router.use('/customers', customerRoutes);
router.use('/tasks', taskRoutes);
router.use('/deals', dealRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;

