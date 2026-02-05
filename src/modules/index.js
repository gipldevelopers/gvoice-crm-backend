const express = require('express');
const router = express.Router();

// Import routes
const demoRoutes = require('./demo/demo.routes');

// Define routes
router.use('/demo', demoRoutes);

module.exports = router;
