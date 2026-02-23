const formatDateTime = (value) => {
    if (!value) return 'N/A';
    try {
        return new Date(value).toLocaleString();
    } catch (error) {
        return String(value);
    }
};

const asHtml = (title, lines = []) => `
<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; line-height: 1.5;">
  <h2 style="margin: 0 0 16px; color: #1f2937;">${title}</h2>
  ${lines.map((line) => `<p style="margin: 0 0 10px; color: #374151;">${line}</p>`).join('')}
  <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">This is an automated notification from Gvoice CRM.</p>
</div>
`;

const leadOpenWarning1DayTemplate = ({ leadName, ownerName }) => {
    const subject = `Lead opening soon: ${leadName} will open in 1 day`;
    const text = [
        `Hi ${ownerName || 'User'},`,
        '',
        `Lead "${leadName}" will open for everyone in 1 day if no ownership action is taken.`,
        'Please update or secure this lead if needed.',
    ].join('\n');

    return {
        subject,
        text,
        html: asHtml('Lead Opening Reminder (1 Day Left)', [
            `Hi ${ownerName || 'User'},`,
            `Lead "<strong>${leadName}</strong>" will open for everyone in <strong>1 day</strong> if no ownership action is taken.`,
            'Please update or secure this lead if needed.',
        ]),
    };
};

const leadNowOpenTemplate = ({ leadName, ownerName }) => {
    const subject = `Lead is now open for everyone: ${leadName}`;
    const text = [
        `Hi ${ownerName || 'User'},`,
        '',
        `Lead "${leadName}" has completed the 15-day lock and is now open for everyone.`,
    ].join('\n');

    return {
        subject,
        text,
        html: asHtml('Lead Now Open For Everyone', [
            `Hi ${ownerName || 'User'},`,
            `Lead "<strong>${leadName}</strong>" has completed the 15-day lock and is now open for everyone.`,
        ]),
    };
};

const claimRequestedToOwnerTemplate = ({ leadName, ownerName, requesterName, approvalDeadlineAt }) => {
    const subject = `Claim requested on your lead: ${leadName}`;
    const text = [
        `Hi ${ownerName || 'User'},`,
        '',
        `${requesterName || 'A user'} has requested to claim your lead "${leadName}".`,
        `Approval window closes at: ${formatDateTime(approvalDeadlineAt)}.`,
    ].join('\n');

    return {
        subject,
        text,
        html: asHtml('Claim Requested On Your Lead', [
            `Hi ${ownerName || 'User'},`,
            `<strong>${requesterName || 'A user'}</strong> has requested to claim your lead "<strong>${leadName}</strong>".`,
            `Approval window closes at: <strong>${formatDateTime(approvalDeadlineAt)}</strong>.`,
        ]),
    };
};

const claimRequestedToApproverUrgentTemplate = ({
    leadName,
    approverName,
    requesterName,
    ownerName,
    approvalDeadlineAt,
}) => {
    const subject = `Urgent action needed: claim approval for ${leadName}`;
    const text = [
        `Hi ${approverName || 'Approver'},`,
        '',
        `${requesterName || 'A user'} requested lead "${leadName}" (owner: ${ownerName || 'Unassigned'}).`,
        `Please review within 12 hours. Deadline: ${formatDateTime(approvalDeadlineAt)}.`,
    ].join('\n');

    return {
        subject,
        text,
        html: asHtml('Urgent: Lead Claim Approval Needed', [
            `Hi ${approverName || 'Approver'},`,
            `<strong>${requesterName || 'A user'}</strong> requested lead "<strong>${leadName}</strong>" (owner: ${ownerName || 'Unassigned'}).`,
            `Please review within <strong>12 hours</strong>. Deadline: <strong>${formatDateTime(approvalDeadlineAt)}</strong>.`,
        ]),
    };
};

const claimExpiredReopenedTemplate = ({ leadName, recipientName, requesterName }) => {
    const subject = `Claim expired, lead reopened: ${leadName}`;
    const text = [
        `Hi ${recipientName || 'User'},`,
        '',
        `Claim request${requesterName ? ` by ${requesterName}` : ''} for lead "${leadName}" expired after 12 hours.`,
        'The lead is open again for the current owner flow.',
    ].join('\n');

    return {
        subject,
        text,
        html: asHtml('Claim Window Expired', [
            `Hi ${recipientName || 'User'},`,
            `Claim request${requesterName ? ` by <strong>${requesterName}</strong>` : ''} for lead "<strong>${leadName}</strong>" expired after <strong>12 hours</strong>.`,
            'The lead is open again for the current owner flow.',
        ]),
    };
};

const claimApprovedOwnershipTemplate = ({ leadName, recipientName, previousOwnerName, newOwnerName }) => {
    const subject = `Lead ownership updated: ${leadName}`;
    const text = [
        `Hi ${recipientName || 'User'},`,
        '',
        `Lead "${leadName}" ownership was approved and updated.`,
        `Previous owner: ${previousOwnerName || 'N/A'}`,
        `New owner: ${newOwnerName || 'N/A'}`,
    ].join('\n');

    return {
        subject,
        text,
        html: asHtml('Lead Ownership Updated', [
            `Hi ${recipientName || 'User'},`,
            `Lead "<strong>${leadName}</strong>" ownership was approved and updated.`,
            `Previous owner: <strong>${previousOwnerName || 'N/A'}</strong><br/>New owner: <strong>${newOwnerName || 'N/A'}</strong>`,
        ]),
    };
};

module.exports = {
    leadOpenWarning1DayTemplate,
    leadNowOpenTemplate,
    claimRequestedToOwnerTemplate,
    claimRequestedToApproverUrgentTemplate,
    claimExpiredReopenedTemplate,
    claimApprovedOwnershipTemplate,
};
