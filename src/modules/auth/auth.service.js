const prisma = require('../../database/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { normalizeRole } = require('../../helpers/employeeHierarchy');
const {
    generateAuthUrl,
    exchangeCodeForToken,
    createAuthClient
} = require('../../helpers/googleAuth.helper');

const buildAuthResponse = async (user) => {
    const token = jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: normalizeRole(user.role),
            companyId: user.companyId
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    await prisma.user.update({
        where: { id: user.id },
        data: { token }
    });

    return {
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            username: user.username,
            role: normalizeRole(user.role),
            company: user.company
        },
        token
    };
};

const login = async (identifier, password) => {
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: identifier },
                { username: identifier }
            ]
        },
        include: { company: true }
    });

    if (!user) {
        throw new Error('Invalid email, username or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        throw new Error('Invalid email or password');
    }

    return buildAuthResponse(user);
};

const getGoogleLoginUrl = async (state = null) => {
    return generateAuthUrl(state);
};

const googleLogin = async (code) => {
    const tokens = await exchangeCodeForToken(code);
    const authClient = createAuthClient(tokens);
    let email = null;
    let isEmailVerified = false;
    let hostedDomain = null;

    let profileName = null;
    let profilePicture = null;

    if (tokens.id_token) {
        const ticket = await authClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        email = payload?.email?.toLowerCase();
        isEmailVerified = !!payload?.email_verified;
        hostedDomain = payload?.hd?.toLowerCase() || null;
        profileName = payload?.name || null;
        profilePicture = payload?.picture || null;
    } else if (tokens.access_token) {
        const oauth2 = google.oauth2({ version: 'v2', auth: authClient });
        const { data } = await oauth2.userinfo.get();
        email = data?.email?.toLowerCase();
        isEmailVerified = !!data?.verified_email;
        hostedDomain = data?.hd?.toLowerCase() || null;
        profileName = data?.name || null;
        profilePicture = data?.picture || null;
    } else {
        throw new Error('Google login failed: token exchange did not return usable tokens');
    }

    if (!isEmailVerified || !email) {
        throw new Error('Google account email is not verified');
    }

    const workspaceDomain = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase();
    if (workspaceDomain && hostedDomain !== workspaceDomain) {
        throw new Error('Only workspace accounts are allowed');
    }

    const user = await prisma.user.findUnique({
        where: { email },
        include: { company: true }
    });

    if (!user) {
        throw new Error('Access denied. Account is not created by admin');
    }

    const authResponse = await buildAuthResponse(user);

    return {
        ...authResponse,
        googleTokens: {
            access_token: tokens.access_token || null,
            refresh_token: tokens.refresh_token || null,
            expiry_date: tokens.expiry_date || null,
            scope: tokens.scope || null,
            token_type: tokens.token_type || null
        },
        googleProfile: {
            email,
            name: profileName || user.fullName || null,
            picture: profilePicture || null
        }
    };
};

const getUserById = async (id) => {
    const user = await prisma.user.findUnique({
        where: { id },
        include: { company: true }
    });

    if (!user) {
        throw new Error('User not found');
    }

    // Don't return sensitive data
    const { password, token, ...safeUser } = user;
    return { ...safeUser, role: normalizeRole(safeUser.role) };
};

module.exports = {
    login,
    getUserById,
    getGoogleLoginUrl,
    googleLogin
};
