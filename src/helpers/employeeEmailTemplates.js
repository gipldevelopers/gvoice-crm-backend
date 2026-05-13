const asHtml = (title, lines = []) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #2563eb; padding: 20px; text-align: center;">
    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${title}</h1>
  </div>
  <div style="padding: 30px;">
    ${lines.map((line) => `<p style="margin: 0 0 15px;">${line}</p>`).join('')}
    <div style="margin-top: 30px; padding: 20px; background-color: #f3f4f6; border-radius: 6px;">
      <p style="margin: 0; font-size: 14px; color: #4b5563;">
        <strong>Note:</strong> This is an automated message. Please do not reply to this email.
      </p>
    </div>
  </div>
  <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="margin: 0; font-size: 12px; color: #9ca3af;">&copy; ${new Date().getFullYear()} Gvoice CRM. All rights reserved.</p>
  </div>
</div>
`;

const newUserWelcomeTemplate = ({ fullName, username, password, companyName, roleLabel }) => {
    const subject = `Welcome to ${companyName} - Your Account Details`;
    const clientUrls = (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map(u => u.trim());
    const loginUrl = clientUrls[0];

    return {
        subject,
        html: asHtml('Welcome to Gvoice CRM', [
            `Hi <strong>${fullName}</strong>,`,
            `Your account has been successfully created at <strong>${companyName}</strong>.`,
            `You can now log in to the CRM using the following credentials:`,
            `<div style="margin: 20px 0; padding: 15px; border: 1px dashed #2563eb; background-color: #eff6ff; border-radius: 8px;">
                <strong>Username:</strong> ${username}<br/>
                <strong>Password:</strong> ${password}<br/>
                <strong>Role:</strong> ${roleLabel || 'N/A'}
            </div>`,
            `Please log in here: <a href="${loginUrl}" style="color: #2563eb; font-weight: bold;">${loginUrl}</a>`,
            `We recommend changing your password after your first login for security purposes.`,
        ]),
    };
};

module.exports = {
    newUserWelcomeTemplate,
};
