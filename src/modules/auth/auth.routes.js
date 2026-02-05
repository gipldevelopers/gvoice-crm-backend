const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.post('/login', authController.login);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
