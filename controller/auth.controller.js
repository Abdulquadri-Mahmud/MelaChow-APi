/**
 * Logout User - Clear Authentication Cookie
 * @route POST /api/user/auth/logout
 */
export const logout = async (req, res) => {
    try {
        // ✅ Clear the authentication cookie
        res.clearCookie("token", {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            path: "/",
            // ❌ NO domain attribute (same as when it was set)
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
