const express = require('express');
const router = express.Router();

// Import routes
const demoRoutes = require('./demo/demo.routes');
const authRoutes = require('./auth/auth.routes');

// Define routes
router.use('/demo', demoRoutes);
router.use('/auth', authRoutes);

module.exports = router;
