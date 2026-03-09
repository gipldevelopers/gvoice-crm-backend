const express = require("express");
const router = express.Router();
const googleController = require("./google.controller");
const { authenticate } = require("../../middleware/auth.middleware");

router.get("/auth", googleController.getAuthUrl);
router.get("/callback", googleController.handleCallback);
router.post("/gmail/messages", authenticate, googleController.listGmailMessages);
router.post("/gmail/send", authenticate, googleController.sendGmailMessage);
router.post("/gmail/messages/:id", authenticate, googleController.getGmailMessageDetail);

module.exports = router;
