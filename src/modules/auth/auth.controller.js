const authService = require('./auth.service');

const login = async (req, res, next) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'Email/Username and password are required' });
        }

        const result = await authService.login(identifier, password);
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

module.exports = {
    login,
    getMe,
    getGoogleLoginUrl,
    googleLogin
};
