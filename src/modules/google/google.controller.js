const googleService = require("./google.service");

class GoogleController {
  async getAuthUrl(req, res, next) {
    try {
      const url = await googleService.getAuthUrl();

      res.status(200).json({
        success: true,
        data: {
          url,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async handleCallback(req, res, next) {
    try {
      const { code } = req.query;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Authorization code is required",
        });
      }

      const tokens = await googleService.handleOAuthCallback(code);

      res.status(200).json({
        success: true,
        message: "Google OAuth callback handled successfully",
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }

  async listGmailMessages(req, res, next) {
    try {
      const { googleTokens, maxResults, labelIds, pageToken, paginated } = req.body;

      const result = await googleService.listGmailMessages(
        googleTokens,
        { maxResults, labelIds, pageToken, paginated }
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async sendGmailMessage(req, res, next) {
    try {
      const { googleTokens, to, subject, message } = req.body;
      const result = await googleService.sendGmailMessage(googleTokens, {
        to,
        subject,
        message,
      });

      res.status(200).json({
        success: true,
        message: "Email sent successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getGmailMessageDetail(req, res, next) {
    try {
      const { id } = req.params;
      const { googleTokens } = req.body;

      const result = await googleService.getGmailMessageDetail(googleTokens, id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new GoogleController();
