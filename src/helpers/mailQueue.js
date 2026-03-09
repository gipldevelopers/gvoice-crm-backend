const { Queue, Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redisConnection = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
});
redisConnection.on('error', (error) => {
    console.error(`[mailQueue] redis error: ${error.message}`);
});

const emailQueue = new Queue('email-queue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            age: 24 * 3600,
            count: 1000,
        },
        removeOnFail: {
            age: 7 * 24 * 3600,
        },
    },
});

let workerInstance = null;

const createTransporter = () => nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_PORT || '587') === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    pool: true, // Reuse connections
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10000,
});

/**
 * Add an email job to the queue.
 * @param {Object} data
 * @param {string|string[]} data.to
 * @param {string} data.subject
 * @param {string} data.html
 * @param {string} [data.text]
 * @param {string} [data.from]
 * @param {number} [delayInMinutes=0]
 * @param {Object} [options]
 * @param {string} [options.jobId]
 * @returns {Promise<Object>}
 */
const addEmailJob = async (data, delayInMinutes = 0, options = {}) => {
    if (!data.to || !data.subject || !data.html) {
        throw new Error('Missing required email fields: to, subject, html');
    }

    const delayInMs = Math.max(0, Number(delayInMinutes || 0)) * 60 * 1000;

    const job = await emailQueue.add(
        'send-email',
        {
            to: data.to,
            subject: data.subject,
            html: data.html,
            text: data.text || '',
            from: data.from || process.env.SMTP_FROM,
        },
        {
            delay: delayInMs,
            ...(options?.jobId ? { jobId: options.jobId } : {}),
        }
    );

    console.log(
        `[mailQueue] queued job=${job.id} to=${Array.isArray(data.to) ? data.to.join(',') : data.to} delayMin=${delayInMinutes}`
    );
    return job;
};

const startEmailWorker = () => {
    if (workerInstance) return workerInstance;

    const transporter = createTransporter();

    workerInstance = new Worker(
        'email-queue',
        async (job) => {
            const { to, subject, html, text, from } = job.data;

            const info = await transporter.sendMail({
                from: from || process.env.SMTP_FROM,
                to,
                subject,
                html,
                text,
            });

            console.log(`[mailQueue] sent job=${job.id} messageId=${info.messageId}`);
            return { success: true, messageId: info.messageId };
        },
        {
            connection: redisConnection,
            concurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY || '10', 10),
        }
    );

    workerInstance.on('failed', (job, err) => {
        console.error(`[mailQueue] failed job=${job?.id}: ${err.message}`);
    });

    workerInstance.on('error', (err) => {
        console.error(`[mailQueue] worker error: ${err.message}`);
    });

    console.log(`[mailQueue] worker started (redis ${REDIS_HOST}:${REDIS_PORT})`);
    return workerInstance;
};

const closeWorker = async (worker = workerInstance) => {
    if (worker) {
        await worker.close();
        workerInstance = null;
        console.log('[mailQueue] worker closed');
    }

    await emailQueue.close();
    await redisConnection.quit();
    console.log('[mailQueue] redis connection closed');
};

module.exports = {
    addEmailJob,
    startEmailWorker,
    closeWorker,
    emailQueue,
};
