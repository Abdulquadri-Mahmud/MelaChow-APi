import jwt from 'jsonwebtoken';

/**
 * Generates a short-lived Access Token (for Authorization header)
 * @param {Object} payload - User/Vendor data (id, role)
 * @returns {string} JWT Access Token
 */
export const generateAccessToken = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '30m' } // Short-lived (25-30 mins recommendation)
    );
};

/**
 * Generates a long-lived Refresh Token (for HttpOnly Cookie)
 * @param {Object} payload - User/Vendor data (id, role)
 * @returns {string} JWT Refresh Token
 */
export const generateRefreshToken = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '7d' } // Matches cookie maxAge
    );
};
