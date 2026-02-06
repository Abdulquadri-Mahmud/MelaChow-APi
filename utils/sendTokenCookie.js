/**
 * ========================================
 * Cross-Domain Cookie Configuration (iOS-Compatible)
 * ========================================
 * 
 * Setup for cross-origin deployments:
 * - Frontend: grub-dash-frontend-xi.vercel.app
 * - Backend: grub-dash-api.vercel.app
 * 
 * Requirements for iOS Safari:
 * 1. SameSite=None (allows cross-site cookies)
 * 2. Secure=true (REQUIRED with SameSite=None)
 * 3. NO domain attribute (let browser handle it)
 * 4. HttpOnly=true (prevents XSS)
 * 
 * ========================================
 */
export const sendTokenCookie = (res, token, cookieName = "token") => {
  const isProduction = process.env.NODE_ENV === "production";

  const cookieOptions = {
    httpOnly: true,              // ✅ Prevents XSS attacks
    secure: true,                // ✅ HTTPS only (required for SameSite=None)
    sameSite: "none",            // ✅ Required for cross-domain cookies
    maxAge: 7 * 24 * 60 * 60 * 1000, // ✅ 7 days
    path: "/",                   // ✅ Available across all routes
    // ❌ NO domain attribute - let the browser set it automatically
    // Setting domain to ".vercel.app" is rejected by browsers for security
  };

  res.cookie(cookieName, token, cookieOptions);

  // ✅ Debug logging (development only)
  if (!isProduction) {
    console.log('[sendTokenCookie] Cookie set:', {
      cookieName,
      tokenLength: token?.length,
      options: cookieOptions,
      willExpireAt: new Date(Date.now() + cookieOptions.maxAge).toISOString(),
    });
  }
};