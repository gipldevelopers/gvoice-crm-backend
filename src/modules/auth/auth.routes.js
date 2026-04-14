const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.post('/login', authController.login);
router.get('/google/url', authController.getGoogleLoginUrl);
router.post('/google/login', authController.googleLogin);
router.get('/me', authenticate, authController.getMe);
router.put('/change-password', authenticate, authController.changePassword);

module.exports = router;
