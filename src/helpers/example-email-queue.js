require('dotenv').config();
const { addEmailJob, startEmailWorker, closeWorker } = require('./mailQueue');

/**
 * Example: How to use the email queue system
 */
async function exampleUsage() {
    console.log('🚀 Starting Email Queue Example...\n');

    // Start the worker to process jobs
    const worker = startEmailWorker();

    // Example 1: Send email immediately (no delay)
    try {
        await addEmailJob({
            to: 'recipient@example.com',
            subject: 'Welcome to Our Platform',
            html: '<h1>Welcome!</h1><p>Thank you for joining us.</p>',
            text: 'Welcome! Thank you for joining us.',
        });
    } catch (error) {
        console.error('Error adding immediate email:', error.message);
    }

    // Example 2: Send email with 10-minute delay
    try {
        await addEmailJob(
            {
                to: 'recipient@example.com',
                subject: 'Reminder: Complete Your Profile',
                html: '<h1>Reminder</h1><p>Please complete your profile to get started.</p>',
                text: 'Reminder: Please complete your profile to get started.',
            },
            10 // 10 minutes delay
        );
    } catch (error) {
        console.error('Error adding delayed email:', error.message);
    }

    // Example 3: Send email with 1-minute delay (for quick testing)
    try {
        await addEmailJob(
            {
                to: 'recipient@example.com',
                subject: 'Test Email - 1 Minute Delay',
                html: '<h1>Test</h1><p>This email was scheduled 1 minute ago.</p>',
                text: 'Test: This email was scheduled 1 minute ago.',
            },
            1 // 1 minute delay for testing
        );
    } catch (error) {
        console.error('Error adding test email:', error.message);
    }

    console.log('\n✅ All email jobs added to queue!');
    console.log('📧 Worker is processing jobs in the background...');
    console.log('💡 Press Ctrl+C to stop the worker\n');

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
        console.log('\n\n🛑 Shutting down gracefully...');
        await closeWorker(worker);
        process.exit(0);
    });

    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', async () => {
        console.log('\n\n🛑 Shutting down gracefully...');
        await closeWorker(worker);
        process.exit(0);
    });
}

// Run the example
exampleUsage().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
