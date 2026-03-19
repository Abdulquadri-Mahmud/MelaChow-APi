import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days
const REFRESH_TOKEN_EXPIRES_IN = '30d'; // 30 days

/**
 * Generate access token (for cookie-based auth - longer lived)
 * @param {string} userId - User ID
 * @param {string} role - User role (user, vendor, admin)
 * @returns {string} JWT Access Token
 */
export const generateAccessToken = (userId, role = 'user') => {
    return jwt.sign(
        {
            id: userId,
            role,
            type: 'access'
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

/**
 * Generate refresh token (long-lived, for token rotation)
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @returns {string} JWT Refresh Token
 */
export const generateRefreshToken = (userId, role = 'user') => {
    return jwt.sign(
        {
            id: userId,
            role,
            type: 'refresh'
        },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expired');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new Error('Invalid token');
        }
        throw error;
    }
};

/**
 * Generate 6-digit OTP
 * @returns {string} 6-digit OTP
 */
export const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate secure reset token (URL-safe)
 * @returns {string} Hex-encoded reset token
 */
export const generateResetToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate tokens for authentication (both access and refresh)
 * @param {Object} payload - User data (id, role)
 * @returns {Object} { accessToken, refreshToken }
 */
export const generateAuthTokens = (payload) => {
    const accessToken = generateAccessToken(payload.id, payload.role);
    const refreshToken = generateRefreshToken(payload.id, payload.role);

    return { accessToken, refreshToken };
};
