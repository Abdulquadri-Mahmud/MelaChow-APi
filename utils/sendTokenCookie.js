/**
 * ========================================
 * Cross-Domain Cookie Configuration (iOS-Compatible)
 * ========================================
 * 
 * Critical for iOS Safari when:
 * - Backend domain ≠ Frontend domain
 * - Using CORS for cross-origin requests
 * 
 * Requirements:
 * 1. SameSite=None (allows cross-site cookies)
 * 2. Secure=true (REQUIRED with SameSite=None)
 * 3. Proper CORS credentials configuration
 * ========================================
 */
export const sendTokenCookie = (res, token, cookieName = "token") => {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie(cookieName, token, {
    httpOnly: true,           
    secure: true,             // ✅ MUST be true for SameSite=None (even in dev!)
    sameSite: "none",         // ✅ Required for cross-domain cookies
    maxAge: 7 * 24 * 60 * 60 * 1000, 
    path: "/",
    // Optional but recommended for cross-domain:
    domain: isProduction ? ".vercel.app" : undefined, // Allows subdomains
  });
};

// **IMPORTANT:** With `SameSite=None`, you **must** use HTTPS even in development, or use a tool like `ngrok` for testing.

// ---

// ### **Solution B: True Same-Site Setup (Requires Infrastructure Change)**

// If you want to keep `SameSite=Lax`, you need BOTH frontend and backend on the same root domain:

// Frontend: https://app.yourdomain.com
// Backend:  https://api.yourdomain.com
// Cookie domain: .yourdomain.com