# 🎨 FRONTEND AUTHENTICATION REFACTORING GUIDE
## Enhanced Auth: Password-Based Login + Persistent Sessions

---

## 🎯 OBJECTIVE

Update frontend to support the new authentication flow for **Users, Vendors, and Admins**:

**OLD FLOW (Every Login):**
```
User flows: Email → Wait for OTP → Enter OTP → Login
```

**NEW FLOW (One-Time Setup):**
```
Registration:
  Enter email → OTP → Set password → Logged in

Login (subsequent visits):
  Enter email + password → Logged in (instant!)

Session:
  HttpOnly Cookie (7-30 days) → Auto-login
```

---

## 📋 CURRENT VS NEW ARCHITECTURE

### Updated Folder Structure:
```
app/(customer)/auth/            app/vendors/auth/               app/admin/auth/
├── signup/                     ├── signup/                     ├── login/
├── verify-registration/        ├── verify-registration/        ├── forgot-password/
├── set-password/               ├── set-password/               ├── reset-password/
├── signin/                     ├── signin/                     └── new-password/
├── forgot-password/            ├── forgot-password/
├── reset-password/             ├── reset-password/
└── new-password/               └── new-password/
```

---

## 🔗 API ENDPOINTS REFERENCE (CRITICAL)

### 👤 User Authentication
| Action | Method | Endpoint | Payload |
| :--- | :--- | :--- | :--- |
| **Register** | `POST` | `/api/user/auth/register` | `{ email, firstname, lastname, phone }` |
| **Verify OTP** | `POST` | `/api/user/auth/verify-registration` | `{ email, otp }` |
| **Set Password** | `POST` | `/api/user/auth/set-password` | `{ email, password }` |
| **Login** | `POST` | `/api/user/auth/login-password` | `{ email, password }` |
| **Forgot Pass** | `POST` | `/api/user/auth/forgot-password-new` | `{ email }` |
| **Verify Reset** | `POST` | `/api/user/auth/verify-reset-code` | `{ email, otp }` |
| **Reset Pass** | `POST` | `/api/user/auth/reset-password-new` | `{ email, resetToken, newPassword }` |
| **Logout** | `POST` | `/api/user/auth/logout` | `{}` |

### 🏪 Vendor Authentication
| Action | Method | Endpoint | Payload |
| :--- | :--- | :--- | :--- |
| **Register** | `POST` | `/api/vendor/auth/register` | `{ email, name, phone, storeName }` |
| **Verify OTP** | `POST` | `/api/vendor/auth/verify-registration` | `{ email, otp }` |
| **Set Password** | `POST` | `/api/vendor/auth/set-password` | `{ email, password }` |
| **Login** | `POST` | `/api/vendor/auth/login-password` | `{ email, password }` |
| **Forgot Pass** | `POST` | `/api/vendor/auth/forgot-password` | `{ email }` |
| **Verify Reset** | `POST` | `/api/vendor/auth/verify-reset-code` | `{ email, otp }` |
| **Reset Pass** | `POST` | `/api/vendor/auth/reset-password` | `{ email, resetToken, newPassword }` |
| **Logout** | `POST` | `/api/vendor/auth/logout` | `{}` |

### 🛡️ Admin Authentication
| Action | Method | Endpoint | Payload |
| :--- | :--- | :--- | :--- |
| **Login** | `POST` | `/api/admin/auth/login` | `{ email, password }` |
| **Forgot Pass** | `POST` | `/api/admin/auth/forgot-password` | `{ email }` |
| **Verify Reset** | `POST` | `/api/admin/auth/verify-reset-code` | `{ email, otp }` |
| **Reset Pass** | `POST` | `/api/admin/auth/reset-password` | `{ email, resetToken, newPassword }` |
| **Logout** | `POST` | `/api/admin/auth/logout` | `{}` |

---

## 🔧 IMPLEMENTATION STEPS (USER)

### STEP 1: Create Sign Up Component

**File: `app/(customer)/auth/signup/page.js`**

```javascript
"use client";
import React, { useState } from "react";
import { useApi } from "@/app/context/ApiContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, User, Phone, Loader2, ArrowRight, Store } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

export default function Signup() {
  const { baseUrl } = useApi();
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: "",
    firstname: "", // Backend epects 'firstname' (lowercase) or 'firstName'? Checked model: 'firstname'
    lastname: "",  // Backend expects 'lastname'
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const endpoint = `${baseUrl}/user/auth/register`;

      if (process.env.NODE_ENV === 'development') {
        console.log('[Signup] Sending registration request to:', endpoint);
      }

      await axios.post(endpoint, formData, {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      });

      setMessage("Verification code sent! 📧");

      setTimeout(() => {
        router.push(
          `/auth/verify-registration?email=${encodeURIComponent(formData.email)}`
        );
      }, 1000);

    } catch (err) {
      console.error('[Signup] Error:', err);
      if (err.response) {
        setMessage(err.response.data.message || "Registration failed.");
      } else {
        setMessage("Network error. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ... (JSX similar to provided prompt, ensure inputs map to formData keys)
  // Check User Model: firstname, lastname are the keys.
  // ...
  return (
      // ... Render Form ...
      // Input name="firstname"
      // Input name="lastname"
      // ...
  );
}
```

### STEP 2: Create Verify Registration Component

**File: `app/(customer)/auth/verify-registration/page.js`**

*Use `endpoint = ${baseUrl}/user/auth/verify-registration`*

```javascript
// ... Imports ...
const handleSubmit = async (e) => {
    // ...
    const endpoint = `${baseUrl}/user/auth/verify-registration`;
    // ... axios.post(endpoint, { email, otp }) ...
    // On success:
    router.push(`/auth/set-password?email=${encodeURIComponent(email)}`);
};
```

### STEP 3: Create Set Password Component

**File: `app/(customer)/auth/set-password/page.js`**

*Use `endpoint = ${baseUrl}/user/auth/set-password`*

```javascript
// ... Imports ...
const handleSubmit = async (e) => {
    // ...
    const endpoint = `${baseUrl}/user/auth/set-password`;
    // ... axios.post(endpoint, { email, password }) ...
    // On success:
    // setUser(data.user)
    router.push("/");
};
```

### STEP 4: Update Sign In Component

**File: `app/(customer)/auth/signin/page.js`**

*Use `endpoint = ${baseUrl}/user/auth/login-password` (Note: `/login-password` not `/login`)*

```javascript
// ...
const handleSubmit = async (e) => {
    // ...
    // ✅ CORRECT ENDPOINT FOR PASSWORD LOGIN
    const endpoint = `${baseUrl}/user/auth/login-password`; 

    const { data } = await axios.post(endpoint, formData, {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
    });
    // ...
};
```

---

## 🏪 VENDOR IMPLEMENTATION (Specifics)

### Vendor Sign Up
**File: `app/vendors/auth/signup/page.js`**
*   **Endpoint**: `/api/vendor/auth/register`
*   **Fields**: `email`, `name` (Owner Name), `phone`, `storeName` (Business Name)
*   **Next Step**: Redirect to `/vendors/auth/verify-registration`

### Vendor Verify
**File: `app/vendors/auth/verify-registration/page.js`**
*   **Endpoint**: `/api/vendor/auth/verify-registration`
*   **Payload**: `{ email, otp }`
*   **Next Step**: Redirect to `/vendors/auth/set-password`

### Vendor Set Password
**File: `app/vendors/auth/set-password/page.js`**
*   **Endpoint**: `/api/vendor/auth/set-password`
*   **Payload**: `{ email, password }`
*   **Next Step**: Redirect to Vendor Dashboard (`/vendors/dashboard`)

### Vendor Login
**File: `app/vendors/auth/signin/page.js`**
*   **Endpoint**: `/api/vendor/auth/login-password`
*   **Payload**: `{ email, password }`
*   **Success**: Redirect to Vendor Dashboard

---

## 🛡️ ADMIN IMPLEMENTATION (Specifics)

### Admin Login
**File: `app/admin/auth/login/page.js`**
*   **Endpoint**: `/api/admin/auth/login`
*   **Payload**: `{ email, password }`
*   **Success**: Redirect to Admin Dashboard (`/admin/dashboard`)

### Admin Forgot Password
**File: `app/admin/auth/forgot-password/page.js`**
*   **Endpoint**: `/api/admin/auth/forgot-password`
*   **Payload**: `{ email }`
*   **Next Step**: Enter OTP (`/admin/auth/verify-reset-code`)

---

## 🚀 DEPLOYMENT CHECKLIST

1. ✅ **Update all API calls** to use the new endpoints listed above.
2. ✅ **HttpOnly Cookies**: Ensure `withCredentials: true` is set on ALL axios requests.
3. ✅ **Error Handling**: 
   - Handle `401 Unauthorized` (Login failed)
   - Handle `423 Locked` (Account locked - show "Try again in 15 mins")
   - Handle `requiresVerification` flag in login response.
4. ✅ **Password Strength**: Enforce 8+ chars on frontend before sending.
5. ✅ **Remove** old OTP-only login forms from the UI (but keep code if needed for reference).

---

**SUMMARY**: The backend is fully ready. Focus on wiring up the React components to these new endpoints. The core flow is identical for all roles (Register -> Verify -> Set Password -> Login), ensuring a consistent codebase.
