# 📧 Background Email Queue System (BullMQ + Nodemailer)

This project implements a **background email scheduling system** using:

- **Redis** → Storage for jobs  
- **BullMQ** → Job queue & scheduler  
- **Nodemailer** → Sends actual emails  
- **mailQueue.js** → Reusable helper  

It allows you to send emails **at a future time** (like 10 minutes after user registration) without blocking your API.

---

## 🎯 What This Solves

Instead of doing this (bad practice):

```js
await saveUser();
await sendEmail(); // user waits
```

We do this (best practice):

```js
await saveUser();
await addEmailJob(data, 10); // instant response
```

Emails are sent **in the background**.

---

## 🧩 Components

### 1. Redis (Storage)
- Stores all pending email jobs
- Running at: `localhost:6379`

### 2. BullMQ (Queue Manager)
- Schedules delayed jobs
- Retries on failure
- Tracks status

### 3. Nodemailer (Mailer)
- Connects to SMTP
- Sends emails

### 4. mailQueue.js (Helper)
- Glue between everything
- Only file you use in your code

---

## 🔄 How It Works

```
User registers
   ↓
addEmailJob()
   ↓
Job stored in Redis
   ↓
Waits 10 minutes
   ↓
Worker picks job
   ↓
Nodemailer sends email
```

Your API never waits.

---

## 📝 Public API

### addEmailJob(data, delayInMinutes)

Schedules an email.

```js
const { addEmailJob } = require('./helpers/mailQueue');

await addEmailJob(
  {
    to: 'user@example.com',
    subject: 'Welcome!',
    html: '<h1>Welcome!</h1>',
  },
  10 // minutes
);
```

---

### startEmailWorker()

Starts background worker (run once).

```js
const { startEmailWorker } = require('./helpers/mailQueue');
startEmailWorker();
```

---

## 🏗️ Real Example

### Controller

```js
async function registerUser(req, res) {
  const user = await prisma.user.create({ data: req.body });

  await addEmailJob(
    {
      to: user.email,
      subject: 'Welcome!',
      html: `<h1>Hello ${user.name}</h1>`
    },
    10
  );

  res.json({ success: true });
}
```

---

## 🏛 Architecture

```
Controller → mailQueue.js → BullMQ → Redis
                                  ↓
                              Worker
                                  ↓
                             Nodemailer
```

---

## 📂 Files

```
src/helpers/
  mailQueue.js
  example-email-queue.js
  integration-example.js
  README.md
```

---

## ⚙️ Environment Variables

Create `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

⚠️ Use Gmail **App Password**, not real password.

---

## 🚀 Start System

### 1. Start Redis

```bash
redis-cli ping
# should return: PONG
```

### 2. Start worker

```js
startEmailWorker();
```

### 3. Use anywhere

```js
addEmailJob(data, 10);
```

---

## 💡 Why This Is Production Grade

| Feature | Supported |
|--------|-----------|
| Background jobs | ✅ |
| Delayed execution | ✅ |
| Auto retries | ✅ |
| Survive restart | ✅ |
| Scalable | ✅ |
| Non-blocking API | ✅ |

---

## 🧠 Real Use Cases

- Welcome emails  
- OTP expiry  
- Payment reminders  
- Trial expiry  
- Follow-up emails  
- Inactive user alerts  

---

## 🏆 Industry Pattern

This exact pattern is used by:

- Stripe
- Amazon
- Netflix
- SaaS products
- Banking systems

---

## Summary

You now have:

- A reusable **email queue system**
- Fully async
- Production architecture
- Zero API blocking
- Automatic retry system

### Only two functions you need:

```js
startEmailWorker();
addEmailJob(data, delay);
```

Everything else is infrastructure.
