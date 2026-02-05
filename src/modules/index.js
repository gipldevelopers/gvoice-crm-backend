const express = require('express');
const router = express.Router();

// Import routes
const demoRoutes = require('./demo/demo.routes');
const authRoutes = require('./auth/auth.routes');
const leadRoutes = require('./leads/lead.routes');

// Define routes
router.use('/demo', demoRoutes);
router.use('/auth', authRoutes);
router.use('/leads', leadRoutes);

module.exports = router;

