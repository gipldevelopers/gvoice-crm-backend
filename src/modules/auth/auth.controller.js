const authService = require('./auth.service');
const activityLogService = require('../activity-logs/activityLog.service');

const login = async (req, res, next) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'Email/Username and password are required' });
        }

        const result = await authService.login(identifier, password);

        // Log login activity
        await activityLogService.logActivity(result.user.id, result.user.company?.id || result.user.companyId, 'LOGIN', req);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message
        });
    }
};

const getMe = async (req, res, next) => {
    try {
        const user = await authService.getUserById(req.user.id);
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

const getGoogleLoginUrl = async (req, res, next) => {
    try {
        const state = req.query?.state || null;
        const url = await authService.getGoogleLoginUrl(state);
        res.status(200).json({
            success: true,
            data: { url }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const googleLogin = async (req, res, next) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Google authorization code is required'
            });
        }

        const result = await authService.googleLogin(code);

        // Log Google login activity
        await activityLogService.logActivity(result.user.id, result.user.company?.id || result.user.companyId, 'LOGIN_GOOGLE', req);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message
        });
    }
};

const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
        }

        await authService.changePassword(req.user.id, currentPassword, newPassword);
        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const logout = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const companyId = req.user.companyId;

        // Log logout activity
        await activityLogService.logActivity(userId, companyId, 'LOGOUT', req);

        // Clear user token in DB
        await authService.clearUserToken(userId);

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    login,
    getMe,
    getGoogleLoginUrl,
    googleLogin,
    changePassword,
    logout
};
