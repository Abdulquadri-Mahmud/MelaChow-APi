/**
 * ========================================
 * iOS-Safe Cookie Configuration
 * ========================================
 * 
 * Context:
 * - Backend: https://grub-dash-api.vercel.app
 * - Frontend: Proxies requests through its own domain (e.g., /api/*)
 * - iOS Safari/PWAs: Block third-party cookies aggressively
 * 
 * Solution:
 * - Use SameSite=Lax (first-party cookies)
 * - Cookies are set through frontend proxy, making them same-site
 * - No cross-site restrictions needed
 * 
 * Why this works:
 * 1. Frontend proxies all API requests through its domain
 * 2. Browser sees cookie as first-party (same domain as page)
 * 3. iOS Safari allows first-party cookies
 * 4. Secure + HttpOnly ensures security
 * 
 * ========================================
 */
export const sendTokenCookie = (res, token, cookieName = "token") => {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie(cookieName, token, {
    httpOnly: true,           // ✅ Prevents XSS attacks
    secure: isProduction,     // ✅ HTTPS only in production
    sameSite: "lax",          // ✅ First-party cookie (iOS-safe)
    maxAge: 7 * 24 * 60 * 60 * 1000, // ✅ 7 days
    path: "/",                // ✅ Available across all routes
  });
};
