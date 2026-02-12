const { Queue, Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const Redis = require('ioredis');

// Redis connection configuration
const redisConnection = new Redis({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
});

// Create email queue
const emailQueue = new Queue('email-queue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            age: 24 * 3600, // Keep completed jobs for 24 hours
            count: 1000,
        },
        removeOnFail: {
            age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
    },
});

// Create Nodemailer transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

/**
 * Add an email job to the queue
 * @param {Object} data - Email data
 * @param {string} data.to - Recipient email address
 * @param {string} data.subject - Email subject
 * @param {string} data.html - HTML content
 * @param {string} [data.text] - Plain text content (optional)
 * @param {number} [delayInMinutes=0] - Delay in minutes before sending
 * @returns {Promise<Object>} Job object with id
 */
const addEmailJob = async (data, delayInMinutes = 0) => {
    try {
        // Validate required fields
        if (!data.to || !data.subject || !data.html) {
            throw new Error('Missing required email fields: to, subject, html');
        }

        const delayInMs = delayInMinutes * 60 * 1000;

        const job = await emailQueue.add(
            'send-email',
            {
                to: data.to,
                subject: data.subject,
                html: data.html,
                text: data.text || '',
                from: process.env.SMTP_FROM,
            },
            {
                delay: delayInMs,
            }
        );

        console.log(`✅ Email job added to queue: ${job.id}`);
        console.log(`   → To: ${data.to}`);
        console.log(`   → Subject: ${data.subject}`);
        console.log(`   → Delay: ${delayInMinutes} minutes`);

        return job;
    } catch (error) {
        console.error('❌ Error adding email job to queue:', error.message);
        throw error;
    }
};

/**
 * Start the email worker to process jobs
 * @returns {Worker} Worker instance
 */
const startEmailWorker = () => {
    const worker = new Worker(
        'email-queue',
        async (job) => {
            const { to, subject, html, text, from } = job.data;

            console.log(`📧 Processing email job: ${job.id}`);
            console.log(`   → To: ${to}`);
            console.log(`   → Subject: ${subject}`);

            try {
                const transporter = createTransporter();

                const info = await transporter.sendMail({
                    from: from || process.env.SMTP_FROM,
                    to,
                    subject,
                    html,
                    text,
                });

                console.log(`✅ Email sent successfully: ${job.id}`);
                console.log(`   → Message ID: ${info.messageId}`);
                console.log(`   → Response: ${info.response}`);

                return { success: true, messageId: info.messageId };
            } catch (error) {
                console.error(`❌ Error sending email (Job ${job.id}):`, error.message);
                throw error; // This will trigger retry mechanism
            }
        },
        {
            connection: redisConnection,
            concurrency: 5, // Process up to 5 emails concurrently
        }
    );

    // Event listeners for better monitoring
    worker.on('completed', (job) => {
        console.log(`✅ Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (err) => {
        console.error('❌ Worker error:', err.message);
    });

    console.log('🚀 Email worker started and listening for jobs...');

    return worker;
};

/**
 * Graceful shutdown
 * @param {Worker} worker - Worker instance to close
 */
const closeWorker = async (worker) => {
    if (worker) {
        await worker.close();
        console.log('👋 Email worker closed gracefully');
    }
    await emailQueue.close();
    await redisConnection.quit();
    console.log('👋 Redis connection closed');
};

module.exports = {
    addEmailJob,
    startEmailWorker,
    closeWorker,
    emailQueue, // Export for monitoring purposes
};
