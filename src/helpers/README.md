# Email Queue System - Usage Guide

## 📋 Overview

A production-ready email queue system using **BullMQ** and **Nodemailer** for background email scheduling in Node.js (CommonJS).

## 🚀 Features

- ✅ **Background email processing** with BullMQ
- ✅ **Dynamic delay scheduling** (send emails X minutes later)
- ✅ **Automatic retries** with exponential backoff
- ✅ **Concurrent processing** (up to 5 emails at once)
- ✅ **Comprehensive logging** (success/failure tracking)
- ✅ **Graceful shutdown** handling
- ✅ **Job persistence** (completed jobs kept for 24h, failed for 7 days)

## 📦 Installation

Already installed! Dependencies:
- `bullmq` ✅
- `ioredis` ✅
- `nodemailer` ✅

## ⚙️ Configuration

### 1. Update `.env` file with your SMTP credentials:

```bash
# Email / SMTP Configuration
SMTP_HOST=smtp.gmail.com          # Your SMTP host
SMTP_PORT=587                      # 587 for TLS, 465 for SSL
SMTP_USER=your-email@gmail.com    # Your email
SMTP_PASS=your-app-password       # App password (not regular password)
SMTP_FROM=your-email@gmail.com    # Sender email
```

### 2. Ensure Redis is running:

```bash
# Redis should be running on localhost:6379
# Check with: redis-cli ping
```

## 📖 Usage

### Basic Usage

```javascript
const { addEmailJob, startEmailWorker } = require('./helpers/mailQueue');

// Start worker (do this ONCE when your server starts)
startEmailWorker();

// Add email job with 10-minute delay
await addEmailJob(
  {
    to: 'user@example.com',
    subject: 'Welcome!',
    html: '<h1>Welcome to our platform!</h1>',
    text: 'Welcome to our platform!', // Optional
  },
  10 // Delay in minutes
);
```

### Integration in Your Server

**In `server.js` or `app.js`:**

```javascript
require('dotenv').config();
const express = require('express');
const { startEmailWorker } = require('./helpers/mailQueue');

const app = express();

// Start email worker once when server starts
startEmailWorker();

// Your routes and middleware...

app.listen(5050, () => {
  console.log('Server running on port 5050');
});
```

### Use in Controllers/Services

```javascript
const { addEmailJob } = require('../helpers/mailQueue');

// Example: User registration controller
async function registerUser(req, res) {
  const { name, email } = req.body;

  // Save user to database
  const user = await prisma.user.create({ data: { name, email } });

  // Schedule welcome email (10 minutes later)
  await addEmailJob(
    {
      to: email,
      subject: 'Welcome to GVoice CRM!',
      html: `<h1>Hi ${name}!</h1><p>Welcome to our platform.</p>`,
    },
    10
  );

  res.json({ success: true, user });
}
```

## 🎯 Real-World Examples

### Example 1: Welcome Email After Registration

```javascript
await addEmailJob(
  {
    to: userData.email,
    subject: 'Welcome to GVoice CRM!',
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h1>Welcome, ${userData.name}! 🎉</h1>
        <p>Thank you for registering.</p>
      </div>
    `,
  },
  10 // Send after 10 minutes
);
```

### Example 2: Password Reset Email (Immediate)

```javascript
await addEmailJob(
  {
    to: user.email,
    subject: 'Password Reset Request',
    html: `<p>Click here to reset: ${resetLink}</p>`,
  },
  0 // Send immediately
);
```

### Example 3: Reminder Email (24 hours later)

```javascript
await addEmailJob(
  {
    to: user.email,
    subject: 'Complete Your Profile',
    html: '<p>Your profile is incomplete. Complete it now!</p>',
  },
  1440 // 24 hours = 1440 minutes
);
```

## 🧪 Testing

### Test with Example File

```bash
# Update SMTP credentials in .env first
node src/helpers/example-email-queue.js
```

### Test with Integration Example

```bash
node src/helpers/integration-example.js
```

## 📊 Monitoring

The helper includes comprehensive logging:

```
✅ Email job added to queue: 12345
   → To: user@example.com
   → Subject: Welcome!
   → Delay: 10 minutes

📧 Processing email job: 12345
   → To: user@example.com
   → Subject: Welcome!

✅ Email sent successfully: 12345
   → Message ID: <abc123@gmail.com>
   → Response: 250 OK
```

## 🔧 Advanced Configuration

### Modify Retry Settings

Edit `mailQueue.js`:

```javascript
defaultJobOptions: {
  attempts: 3,              // Retry up to 3 times
  backoff: {
    type: 'exponential',    // Exponential backoff
    delay: 2000,            // Start with 2s delay
  },
}
```

### Modify Concurrency

Edit `mailQueue.js`:

```javascript
const worker = new Worker('email-queue', async (job) => {
  // ...
}, {
  connection: redisConnection,
  concurrency: 5,  // Change this number
});
```

## 🛑 Graceful Shutdown

The helper includes graceful shutdown handling:

```javascript
const { closeWorker } = require('./helpers/mailQueue');

process.on('SIGINT', async () => {
  await closeWorker(worker);
  process.exit(0);
});
```

## 📝 API Reference

### `addEmailJob(data, delayInMinutes)`

Adds an email job to the queue.

**Parameters:**
- `data` (Object):
  - `to` (string, required): Recipient email
  - `subject` (string, required): Email subject
  - `html` (string, required): HTML content
  - `text` (string, optional): Plain text content
- `delayInMinutes` (number, optional): Delay in minutes (default: 0)

**Returns:** Promise<Job>

### `startEmailWorker()`

Starts the worker to process email jobs.

**Returns:** Worker instance

### `closeWorker(worker)`

Gracefully closes the worker and Redis connection.

**Parameters:**
- `worker` (Worker): Worker instance to close

**Returns:** Promise<void>

## 🔐 Gmail Setup (App Password)

If using Gmail:

1. Enable 2-Factor Authentication
2. Go to: https://myaccount.google.com/apppasswords
3. Generate an app password
4. Use the app password in `SMTP_PASS` (not your regular password)

## 🐛 Troubleshooting

### Redis Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
**Solution:** Start Redis: `redis-server`

### SMTP Authentication Error
```
Error: Invalid login: 535-5.7.8 Username and Password not accepted
```
**Solution:** Use app password for Gmail, not regular password

### Jobs Not Processing
**Solution:** Make sure you called `startEmailWorker()` in your server

## 📚 Files Created

- `src/helpers/mailQueue.js` - Main helper module
- `src/helpers/example-email-queue.js` - Basic usage examples
- `src/helpers/integration-example.js` - Real-world integration examples

## 🎓 Learning Resources

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Nodemailer Documentation](https://nodemailer.com/)
- [Redis Documentation](https://redis.io/docs/)

---

**Created by:** Senior Node.js Backend Engineer  
**Version:** 1.0.0  
**License:** MIT
