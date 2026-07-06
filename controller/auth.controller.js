import jwt from "jsonwebtoken";
import { blockToken } from "../middleware/tokenBlocklist.js";

/**
 * Logout User - Clear Authentication Cookie
 * @route POST /api/user/auth/logout
 */
export const logout = async (req, res) => {
    try {
        // Block the current token if it exists
        const token = req.cookies?.token;
        if (token) {
            try {
                const decoded = jwt.decode(token);
                if (decoded?.exp) {
                    await blockToken(token, decoded.exp);
                }
            } catch (e) {
                console.error('[logout] Token blocking failed:', e.message);
            }
        }

        // ✅ Clear the authentication cookie
        res.clearCookie("token", {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            path: "/",
            // ❌ NO domain attribute (same as when it was set)
        });
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            path: '/',
        });

        // ✅ Debug logging
        if (process.env.NODE_ENV !== 'production') {
            console.log('[logout] Cookie cleared for user');
        }

        res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });

    } catch (error) {
        console.error('[logout] Error:', error);
        res.status(500).json({
            success: false,
            message: "Logout failed",
            error: error.message,
        });
    }
};
