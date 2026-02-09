const dashboardService = require('./dashboard.service');

class DashboardController {
    async getStats(req, res) {
        try {
            const companyId = req.user.companyId;
            const stats = await dashboardService.getDashboardStats(companyId);

            return res.status(200).json({
                success: true,
                message: 'Dashboard stats fetched successfully',
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
            const companyId = req.user.companyId;
            const trends = await dashboardService.getDashboardTrends(companyId);

            return res.status(200).json({
                success: true,
                message: 'Dashboard trends fetched successfully',
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
}

module.exports = new DashboardController();
