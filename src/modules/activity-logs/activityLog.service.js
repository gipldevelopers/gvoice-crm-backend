const prisma = require('../../database/prisma');

const parseUserAgent = (userAgentString) => {
    if (!userAgentString) return 'Unknown Device';
    
    let os = 'Unknown OS';
    let browser = 'Unknown Browser';
    
    // Simple OS detection
    if (userAgentString.includes('Windows')) os = 'Windows';
    else if (userAgentString.includes('Macintosh') || userAgentString.includes('Mac OS')) os = 'macOS';
    else if (userAgentString.includes('iPhone') || userAgentString.includes('iPad')) os = 'iOS';
    else if (userAgentString.includes('Android')) os = 'Android';
    else if (userAgentString.includes('Linux')) os = 'Linux';
    
    // Simple Browser detection
    if (userAgentString.includes('Chrome') && !userAgentString.includes('Chromium') && !userAgentString.includes('Edg')) browser = 'Chrome';
    else if (userAgentString.includes('Safari') && !userAgentString.includes('Chrome')) browser = 'Safari';
    else if (userAgentString.includes('Firefox')) browser = 'Firefox';
    else if (userAgentString.includes('Edg')) browser = 'Edge';
    else if (userAgentString.includes('Trident') || userAgentString.includes('MSIE')) browser = 'IE';
    
    return `${os} / ${browser}`;
};

const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Radius of the Earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
};

const logActivity = async (userId, companyId, action, req) => {
    try {
        if (!userId || !companyId) return;

        const userAgent = req?.headers?.['user-agent'] || '';
        const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '';
        const device = parseUserAgent(userAgent);
        let location = req?.body?.location || null;

        const latitude = req?.body?.latitude ? parseFloat(req.body.latitude) : null;
        const longitude = req?.body?.longitude ? parseFloat(req.body.longitude) : null;

        console.log(`[Geofence Debug] Action: ${action}`);
        console.log(`[Geofence Debug] Received User Coordinates: lat=${latitude}, lon=${longitude}`);

        if (latitude !== null && longitude !== null && !isNaN(latitude) && !isNaN(longitude)) {
            const company = await prisma.company.findUnique({
                where: { id: companyId }
            });

            if (company) {
                console.log(`[Geofence Debug] Configured Office Coordinates: lat=${company.officeLatitude}, lon=${company.officeLongitude}`);
                if (company.officeLatitude !== null && company.officeLongitude !== null) {
                    const distance = getDistance(latitude, longitude, company.officeLatitude, company.officeLongitude);
                    console.log(`[Geofence Debug] Calculated Distance: ${distance.toFixed(2)} meters`);
                    if (distance <= 500) {
                        location = "In Office";
                        console.log(`[Geofence Debug] WITHIN GEOFENCE! Location set to In Office`);
                    } else {
                        console.log(`[Geofence Debug] OUTSIDE GEOFENCE!`);
                    }
                } else {
                    console.log(`[Geofence Debug] Company office coordinates not set in settings!`);
                }
            }
        }

        return await prisma.activityLog.create({
            data: {
                userId,
                companyId,
                action,
                device,
                ipAddress,
                location
            }
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
};

const getActivityLogs = async (companyId) => {
    return await prisma.activityLog.findMany({
        where: { companyId },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                    department: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};

module.exports = {
    logActivity,
    getActivityLogs
};
