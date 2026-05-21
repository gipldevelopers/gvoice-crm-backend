const activityLogService = require('./activityLog.service');

const getActivityLogs = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const logs = await activityLogService.getActivityLogs(companyId);
        
        res.status(200).json({
            success: true,
            data: logs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    getActivityLogs
};
