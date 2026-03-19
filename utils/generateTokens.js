import { generateAccessToken as genAccess, generateRefreshToken as genRefresh } from './jwt.js';

/**
 * Generates a short-lived Access Token
 * Preserves compatibility with existing calls using a single payload object
 */
export const generateAccessToken = (payload) => {
    // If payload is already an object, use its id and role
    const id = payload.riderId || payload.adminId || payload.vendorId || payload.userId || payload.id;
    const role = payload.role || 'user';
    return genAccess(id, role);
};

/**
 * Generates a long-lived Refresh Token
 */
export const generateRefreshToken = (payload) => {
    const id = payload.riderId || payload.adminId || payload.vendorId || payload.userId || payload.id;
    const role = payload.role || 'user';
    return genRefresh(id, role);
};
