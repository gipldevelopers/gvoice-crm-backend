const dashboardService = require('./dashboard.service');

class DashboardController {
    async getStats(req, res) {
        try {
            const isGlobalAdmin = req.user.isPlatformAdmin;
            let stats;

            if (isGlobalAdmin) {
                stats = await dashboardService.getGlobalDashboardStats();
            } else {
                const companyId = req.user.companyId;
                stats = await dashboardService.getDashboardStats(companyId);
            }

            return res.status(200).json({
                success: true,
                message: isGlobalAdmin ? 'Global dashboard stats fetched' : 'Company dashboard stats fetched',
                data: stats
            });
        } catch (error) {
            console.error('Error in getStats:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching dashboard stats'
            });
        }
    }

    async getTrends(req, res) {
        try {
            const isGlobalAdmin = req.user.isPlatformAdmin;
            let trends;

            if (isGlobalAdmin) {
                trends = await dashboardService.getGlobalDashboardTrends();
            } else {
                const companyId = req.user.companyId;
                trends = await dashboardService.getDashboardTrends(companyId);
            }

            return res.status(200).json({
                success: true,
                message: isGlobalAdmin ? 'Global dashboard trends fetched' : 'Company dashboard trends fetched',
                data: trends
            });
        } catch (error) {
            console.error('Error in getTrends:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching dashboard trends'
            });
        }
    }

    async getActivities(req, res) {
        try {
            const { page = 1, limit = 50 } = req.query;
            console.log('Fetching activities for page:', page, 'limit:', limit);
            if (!req.user.isPlatformAdmin) {
                return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
            }
            const data = await dashboardService.getGlobalActivities(page, limit);
            console.log('Activities found:', data.activities.length);
            return res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Error in getActivities controller:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new DashboardController();
