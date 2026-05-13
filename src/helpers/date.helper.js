/**
 * Formats a date according to the system timezone.
 * Defaults to Asia/Kolkata (IST) if not specified in .env
 */
const formatInSystemTimezone = (date = new Date()) => {
    const timezone = process.env.SYSTEM_TIMEZONE || 'Asia/Kolkata';
    
    // Using en-GB for DD/MM/YYYY format, or en-US if they prefer MM/DD/YYYY
    // Based on the user example [5/4/2026 6:18:30 AM], let's see:
    // If 4th May, it's D/M or M/D.
    // I'll use a specific format: DD/MM/YYYY HH:mm:ss
    
    const options = {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    
    const getPart = (type) => parts.find(p => p.type === type).value;
    
    // Example: [5/13/2026 4:03:43 PM]
    return `${getPart('month')}/${getPart('day')}/${getPart('year')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')} ${getPart('dayPeriod')}`;
};

module.exports = {
    formatInSystemTimezone
};
