require('dotenv').config();
const { addEmailJob, startEmailWorker } = require('./helpers/mailQueue');

/**
 * Real-world integration example:
 * Send a welcome email 10 minutes after user registration
 */

// Simulate user registration
async function handleUserRegistration(userData) {
    console.log('📝 User registered:', userData.email);

    // Save user to database (your existing logic)
    // const user = await prisma.user.create({ data: userData });

    // Schedule welcome email to be sent 10 minutes later
    try {
        await addEmailJob(
            {
                to: userData.email,
                subject: 'Welcome to GVoice CRM!',
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Welcome, ${userData.name}! 🎉</h1>
            <p style="color: #666; font-size: 16px;">
              Thank you for registering with GVoice CRM. We're excited to have you on board!
            </p>
            <p style="color: #666; font-size: 16px;">
              Get started by exploring our features and setting up your first project.
            </p>
            <a href="https://yourapp.com/dashboard" 
               style="display: inline-block; padding: 12px 24px; background-color: #007bff; 
                      color: white; text-decoration: none; border-radius: 5px; margin-top: 20px;">
              Go to Dashboard
            </a>
            <p style="color: #999; font-size: 14px; margin-top: 30px;">
              Best regards,<br>
              The GVoice CRM Team
            </p>
          </div>
        `,
                text: `Welcome, ${userData.name}! Thank you for registering with GVoice CRM.`,
            },
            10 // Send after 10 minutes
        );

        console.log('✅ Welcome email scheduled successfully');
    } catch (error) {
        console.error('❌ Failed to schedule welcome email:', error.message);
    }
}

/**
 * Another example: Send reminder email for incomplete profile
 */
async function sendProfileReminderEmail(userId, userEmail, userName) {
    try {
        await addEmailJob(
            {
                to: userEmail,
                subject: 'Complete Your Profile - GVoice CRM',
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hi ${userName},</h2>
            <p style="color: #666; font-size: 16px;">
              We noticed your profile is incomplete. Complete it now to unlock all features!
            </p>
            <a href="https://yourapp.com/profile/${userId}" 
               style="display: inline-block; padding: 12px 24px; background-color: #28a745; 
                      color: white; text-decoration: none; border-radius: 5px; margin-top: 20px;">
              Complete Profile
            </a>
          </div>
        `,
                text: `Hi ${userName}, complete your profile to unlock all features.`,
            },
            1440 // Send after 24 hours (1440 minutes)
        );

        console.log('✅ Profile reminder email scheduled');
    } catch (error) {
        console.error('❌ Failed to schedule reminder email:', error.message);
    }
}

// Example usage in your application
async function main() {
    // Start the email worker (do this once when your server starts)
    startEmailWorker();

    // Simulate user registration
    await handleUserRegistration({
        name: 'John Doe',
        email: 'john@example.com',
    });

    // Simulate sending profile reminder
    await sendProfileReminderEmail('user-123', 'john@example.com', 'John Doe');

    console.log('\n✅ Integration example completed!');
    console.log('💡 In production, call startEmailWorker() once in your server.js');
    console.log('💡 Then use addEmailJob() anywhere in your controllers/services');
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    handleUserRegistration,
    sendProfileReminderEmail,
};
