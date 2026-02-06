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
}

module.exports = new DashboardController();
