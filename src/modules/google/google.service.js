const {
  generateAuthUrl,
  exchangeCodeForToken,
  createAuthClient,
} = require("../../helpers/googleAuth.helper");
const {
  getGmailClient,
  listMessages,
  sendEmail,
  getMessageWithThread,
} = require("../../helpers/gmail.helper");
const { getCalendarClient } = require("../../helpers/calendar.helper");
const { getDriveClient } = require("../../helpers/drive.helper");

class GoogleService {
  isReconnectRequiredError(error) {
    const message = error?.message?.toLowerCase() || "";
    return (
      message.includes("no refresh token is set") ||
      message.includes("invalid_grant") ||
      message.includes("invalid credentials")
    );
  }

  async getAuthUrl() {
    try {
      return generateAuthUrl();
    } catch (error) {
      throw new Error(`Failed to generate Google auth URL: ${error.message}`);
    }
  }

  async handleOAuthCallback(code) {
    try {
      return await exchangeCodeForToken(code);
    } catch (error) {
      throw new Error(`Failed to exchange OAuth code: ${error.message}`);
    }
  }

  async getGoogleClients(tokens) {
    try {
      const auth = createAuthClient(tokens);

      return {
        auth,
        gmail: getGmailClient(auth),
        calendar: getCalendarClient(auth),
        drive: getDriveClient(auth),
      };
    } catch (error) {
      throw new Error(`Failed to initialize Google clients: ${error.message}`);
    }
  }

  async listGmailMessages(tokens, options = {}) {
    try {
      if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
        throw new Error("Google tokens are required");
      }

      const auth = createAuthClient(tokens);
      const { messages, nextPageToken } = await listMessages(auth, options);

      return {
        messages,
        nextPageToken: nextPageToken || null,
        tokens: {
          access_token: auth.credentials.access_token || tokens.access_token,
          refresh_token: auth.credentials.refresh_token || tokens.refresh_token,
          expiry_date: auth.credentials.expiry_date || tokens.expiry_date,
          scope: auth.credentials.scope || tokens.scope,
          token_type: auth.credentials.token_type || tokens.token_type,
        },
      };
    } catch (error) {
      if (this.isReconnectRequiredError(error)) {
        throw new Error("Google session expired. Please reconnect Google.");
      }
      throw new Error(`Failed to fetch Gmail messages: ${error.message}`);
    }
  }

  async sendGmailMessage(tokens, { to, subject, message }) {
    try {
      if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
        throw new Error("Google tokens are required");
      }
      if (!to || !subject || !message) {
        throw new Error("To, subject, and message are required");
      }

      const auth = createAuthClient(tokens);
      const result = await sendEmail(auth, to, subject, message);

      return {
        message: result,
        tokens: {
          access_token: auth.credentials.access_token || tokens.access_token,
          refresh_token: auth.credentials.refresh_token || tokens.refresh_token,
          expiry_date: auth.credentials.expiry_date || tokens.expiry_date,
          scope: auth.credentials.scope || tokens.scope,
          token_type: auth.credentials.token_type || tokens.token_type,
        },
      };
    } catch (error) {
      if (this.isReconnectRequiredError(error)) {
        throw new Error("Google session expired. Please reconnect Google.");
      }
      throw new Error(`Failed to send Gmail message: ${error.message}`);
    }
  }

  async getGmailMessageDetail(tokens, messageId) {
    try {
      if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
        throw new Error("Google tokens are required");
      }
      if (!messageId) {
        throw new Error("Message ID is required");
      }

      const auth = createAuthClient(tokens);
      const detail = await getMessageWithThread(auth, messageId);

      return {
        ...detail,
        tokens: {
          access_token: auth.credentials.access_token || tokens.access_token,
          refresh_token: auth.credentials.refresh_token || tokens.refresh_token,
          expiry_date: auth.credentials.expiry_date || tokens.expiry_date,
          scope: auth.credentials.scope || tokens.scope,
          token_type: auth.credentials.token_type || tokens.token_type,
        },
      };
    } catch (error) {
      if (this.isReconnectRequiredError(error)) {
        throw new Error("Google session expired. Please reconnect Google.");
      }
      throw new Error(`Failed to fetch Gmail message detail: ${error.message}`);
    }
  }
}

module.exports = new GoogleService();
