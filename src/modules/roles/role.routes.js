const express = require('express');
const router = express.Router();
const roleController = require('./role.controller');
const { authenticate } = require('../../middleware/auth.middleware');

// All role routes require authentication
router.use(authenticate);

router.get('/', roleController.getRoles);
router.post('/', roleController.createRole);
router.put('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

module.exports = router;
