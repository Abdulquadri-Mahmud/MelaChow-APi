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
export const sendTokenCookie = (res, token, cookieName = 'token', maxAge = 15 * 60 * 1000) => {
  const isProduction = process.env.NODE_ENV === "production";

  const cookieOptions = {
    httpOnly: true,              // ✅ Prevents XSS attacks
    secure: isProduction,         // ✅ HTTPS only in production (required for SameSite=None)
    sameSite: isProduction ? "none" : "lax", // ✅ Required for cross-domain cookies in prod
    maxAge,
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

export const sendAuthCookies = (res, accessToken, refreshToken, role = 'user') => {
  const names = {
    user: ['token', 'refreshToken'],
    vendor: ['vendorToken', 'vendorRefreshToken'],
    admin: ['adminToken', 'adminRefreshToken'],
    rider: ['riderToken', 'riderRefreshToken'],
  };
  const [accessName, refreshName] = names[role] || names.user;
  sendTokenCookie(res, accessToken, accessName, 15 * 60 * 1000);
  sendTokenCookie(res, refreshToken, refreshName, 30 * 24 * 60 * 60 * 1000);
};
