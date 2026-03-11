const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const app = require("./app");
const http = require("http");
const { startEmailWorker, closeWorker } = require("./helpers/mailQueue");
const leadService = require("./modules/leads/lead.service");

const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

const server = http.createServer(app);
const emailWorker = startEmailWorker();

const LEAD_TIMER_NOTIFICATION_INTERVAL_MS = parseInt(
  process.env.LEAD_TIMER_NOTIFICATION_INTERVAL_MS || "1800000",
  10
);

const runLeadTimerNotifications = async () => {
  try {
    const result = await leadService.processLeadTimerNotifications();
    if (result?.checked) {
      console.log(
        `[lead-email] timer check complete checked=${result.checked} sent=${result.sent}`
      );
    }
  } catch (error) {
    console.error(`[lead-email] timer notification check failed: ${error.message}`);
  }
};

setTimeout(runLeadTimerNotifications, 15000);
const leadTimerNotificationInterval = setInterval(
  runLeadTimerNotifications,
  LEAD_TIMER_NOTIFICATION_INTERVAL_MS
);

// Start Server
server.listen(PORT, () => {
  console.log("\n========================================");
  console.log("Project Backend Online");
  console.log("Server running on:", SERVER_URL);
  console.log("Client URL allowed:", CLIENT_URL);
  console.log("Health check:", `${SERVER_URL}/health`);
  console.log("Started at:", new Date().toLocaleString());
  console.log("========================================\n");
});

// Graceful Shutdown
const shutdown = () => {
  console.log("\nShutting down server...");
  clearInterval(leadTimerNotificationInterval);

  server.close(async () => {
    try {
      await closeWorker(emailWorker);
    } catch (error) {
      console.error(`[mailQueue] close failed: ${error.message}`);
    }
    console.log("Server closed safely.");
    process.exit(0);
  });

  setTimeout(() => {
    console.log("Forced shutdown due to timeout.");
    process.exit(1);
  }, 5000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = server;
