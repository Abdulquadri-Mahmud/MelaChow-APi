import jwt from "jsonwebtoken";
import { blockToken } from "../middleware/tokenBlocklist.js";

/**
 * Logout User - Clear Authentication Cookie
 * @route POST /api/user/auth/logout
 */
export const logout = async (req, res) => {
    try {
        const isProduction = process.env.NODE_ENV === "production";
        const tokensToBlock = [
            req.cookies?.token,
            req.cookies?.refreshToken,
            req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null,
        ].filter(Boolean);

        for (const token of tokensToBlock) {
            try {
                const decoded = jwt.decode(token);
                if (decoded?.exp) {
                    await blockToken(token, decoded.exp);
                }
            } catch (e) {
                console.error('[logout] Token blocking failed:', e.message);
            }
        }

        // ✅ Clear the authentication cookies with matching attributes
        const clearOpts = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            path: "/",
        };
        res.clearCookie("token", clearOpts);
        res.clearCookie("refreshToken", clearOpts);

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
