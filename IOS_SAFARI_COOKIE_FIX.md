# 🍎 iOS Safari Cookie & Auth Configuration Fixes

## 📌 Context
This update addresses critical authentication issues experienced on iOS Safari where cross-origin cookies were not being stored or sent correctly. This was causing users to be logged out immediately after login or upon page refresh.

**Problem Root Causes:**
1.  **Incorrect Domain Attribute:** Setting `domain: ".vercel.app"` explicitly causes many browsers (especially Safari) to reject the cookie for security reasons when the backend and frontend are on different subdomains of `vercel.app`.
2.  **CORS & Credentials:** While `credentials: true` was present, the interaction with specific cookie attributes needed optimization.
3.  **Missing Logout:** There was no dedicated server-side endpoint to properly clear the `httpOnly` cookie.

## 🛠 Changes Implemented

### 1. Cookie Configuration (`utils/sendTokenCookie.js`)
*   **Action:** Removed the `domain` attribute entirely.
*   **Result:** The browser now defaults to the host domain, which is the correct behavior for this cross-origin setup.
*   **Attributes:**
    *   `SameSite=None`: Required for cross-site requests (Frontend and Backend are on different origins).
    *   `Secure=True`: Mandatory when `SameSite=None`.
    *   `HttpOnly=True`: Prevents XSS.

### 2. CORS Configuration (`index.js`)
*   **Action:** Removed `exposedHeaders: ["Set-Cookie"]` as it is unnecessary and potentially confusing.
*   **Action:** Validated `credentials: true` is set to allow cookies to be sent and received.
*   **Action:** Added debug logging for blocked origins.

### 3. Debug Middleware (`index.js`)
*   **Action:** Added development-only middleware to log request details for auth routes.
*   **Logs:** Method, Path, Origin, `hasCookies` boolean, and specific cookie keys.

### 4. Logout Implementation (`controller/auth.controller.js`)
*   **Action:** Created a dedicated `logout` controller.
*   **Function:** Uses `res.clearCookie()` with the **exact same attributes** (`httpOnly`, `secure`, `sameSite`) used to set the cookie. This is required to successfully delete it.

### 5. Profile Debugging (`controller/user/user.controller.js`)
*   **Action:** Added logs to `getProfile` to verify if the token is present in `req.cookies` and if the user is successfully found in the DB.

## 🧪 Verifying Fixes

### In Vercel Logs
Look for these patterns to verify success:

1.  **On Login:**
    ```text
    [sendTokenCookie] Cookie set: { cookieName: 'token', ... }
    ```

2.  **On Profile Fetch (Refresh):**
    ```text
    [Request Debug] { path: '/api/user/auth/profile', hasCookies: true, ... }
    [getProfile] Request received: { hasCookie: true ... }
    ```

3.  **On Logout:**
    ```text
    [logout] Cookie cleared for user
    ```

## 📱 Developer Notes
*   **Testing Locally:** Since `Secure=true` is mandatory for `SameSite=None`, local testing of cookies typically requires HTTPS (or `SameSite=Lax` temporarily, but that changes behavior).
*   **Production:** These settings verify that the backend is ready for cross-origin production deployment on Vercel.
