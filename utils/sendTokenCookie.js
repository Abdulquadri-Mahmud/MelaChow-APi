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
const durationToMs = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').trim().match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) return fallback;
  const units = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * units[match[2].toLowerCase()];
};

export const sendTokenCookie = (res, token, cookieName = 'token', maxAge = durationToMs(process.env.JWT_EXPIRES_IN || '7d', 7 * 24 * 60 * 60 * 1000)) => {
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
  const accessMaxAge = durationToMs(process.env.JWT_EXPIRES_IN || '7d', 7 * 24 * 60 * 60 * 1000);
  sendTokenCookie(res, accessToken, accessName, accessMaxAge);
  sendTokenCookie(res, refreshToken, refreshName, 30 * 24 * 60 * 60 * 1000);
};
