export const sendTokenCookie = (res, token, cookieName = "token") => {
    const isProduction = process.env.NODE_ENV === "production";

    const options = {
        httpOnly: true,
        secure: isProduction,
        // Use "none" in production for cross-origin requests (Vercel frontend)
        // "none" requires secure: true
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches JWT_EXPIRES_IN)
        path: "/", // Explicitly set path to ensure cookie is sent on all routes
        // iOS Safari 16.4+ compatibility: Partitioned cookies for cross-site contexts
        // This prevents cookies from being blocked by iOS Intelligent Tracking Prevention (ITP)
        ...(isProduction && { partitioned: true }),
    };

    res.cookie(cookieName, token, options);
};
