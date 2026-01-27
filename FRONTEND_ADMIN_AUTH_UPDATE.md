# Frontend Update: Admin Authentication & Security Changes

## 🚨 IMPORTANT SECURITY UPDATE

The backend has been updated to enforce stricter authentication on admin routes. You need to update your frontend admin API calls to reflect these changes.

---

## 🔐 Admin Authentication Endpoints

### Login
```javascript
POST /api/admin/login
Content-Type: application/json

Body:
{
  "email": "admin@example.com",
  "password": "your_password"
}

Response (Success):
{
  "success": true,
  "message": "Login successful",
  "admin": {
    "_id": "...",
    "name": "Admin Name",
    "email": "admin@example.com",
    "role": "admin"
  }
}

// Sets HTTP-only cookie: adminToken
```

### Register (First-time setup)
```javascript
POST /api/admin/register
Content-Type: application/json

Body:
{
  "name": "Admin Name",
  "email": "admin@example.com",
  "password": "secure_password",
  "role": "admin" // or "super-admin"
}

Response (Success):
{
  "success": true,
  "message": "Admin registered successfully",
  "admin": { ... }
}
```

### Logout
```javascript
POST /api/admin/logout
Credentials: include

Response (Success):
{
  "success": true,
  "message": "Logged out successfully"
}

// Clears adminToken cookie
```

### Forgot Password
```javascript
POST /api/admin/forgot-password
Content-Type: application/json

Body:
{
  "email": "admin@example.com"
}

Response (Success):
{
  "success": true,
  "message": "OTP sent to your email"
}
```

### Reset Password
```javascript
POST /api/admin/reset-password
Content-Type: application/json

Body:
{
  "email": "admin@example.com",
  "otp": "123456",
  "newPassword": "new_secure_password"
}

Response (Success):
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

## 🔧 Required Frontend Changes

### 1. **Update API Configuration**

**CRITICAL:** All admin API calls MUST include credentials to send the authentication cookie.

```javascript
// ✅ CORRECT - Using fetch
const response = await fetch('http://localhost:3001/api/admin/vendors/get-all', {
  method: 'GET',
  credentials: 'include', // REQUIRED for cookie-based auth
  headers: {
    'Content-Type': 'application/json',
  },
});

// ✅ CORRECT - Using axios
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001',
  withCredentials: true, // REQUIRED for cookie-based auth
});

const response = await api.get('/api/admin/vendors/get-all');
```

### 2. **Updated Admin Endpoints**

The following endpoints now **REQUIRE** authentication (previously unprotected):

#### Get All Vendors
```javascript
// BEFORE (unprotected)
GET /api/admin/vendors/get-all

// AFTER (requires auth)
GET /api/admin/vendors/get-all
Credentials: include
```

#### Update Commission
```javascript
// BEFORE (unprotected)
PATCH /api/admin/vendors/commission

// AFTER (requires auth)
PATCH /api/admin/vendors/commission
Credentials: include
```

#### Delete Admin
```javascript
// BEFORE
DELETE /api/admin/delete

// AFTER (changed to URL param + auth required)
DELETE /api/admin/delete/:id
Credentials: include

// Example:
DELETE /api/admin/delete/507f1f77bcf86cd799439011
```

---

## 📋 Complete List of Protected Admin Routes

**ALL** of these routes require authentication via HTTP-only cookie:

### Vendor Management
```javascript
GET    /api/admin/vendors/get-all?verified=true&suspended=false
GET    /api/admin/vendors/single?vendorId=123
PATCH  /api/admin/vendors/approve?vendorId=123
PATCH  /api/admin/vendors/reject?vendorId=123&reason=...
PATCH  /api/admin/vendors/suspend?vendorId=123&reason=...
PATCH  /api/admin/vendors/reactivate?vendorId=123
PATCH  /api/admin/vendors/status?vendorId=123&suspended=true
PATCH  /api/admin/vendors/commission
GET    /api/admin/vendors/performance?vendorId=123
GET    /api/admin/vendors/foods?vendorId=123
```

### User Management
```javascript
GET    /api/admin/user/all?verified=true&suspended=false
GET    /api/admin/user/single?userId=123
GET    /api/admin/user/stats
PATCH  /api/admin/user/suspend?userId=123&reason=...
PATCH  /api/admin/user/ban?userId=123&reason=...
PATCH  /api/admin/user/reactivate?userId=123
```

### Admin Management
```javascript
GET    /api/admin/get-all
DELETE /api/admin/delete/:id
```

### Category Management
```javascript
GET    /api/categories/admin/all
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id
```

---

## 🛠️ Implementation Checklist

### Step 1: Update API Client Configuration
- [ ] Add `credentials: 'include'` to all fetch calls
- [ ] OR set `withCredentials: true` in axios config
- [ ] Create a centralized API client/service

### Step 2: Update Admin Login Flow
- [ ] Create admin login page at `/admin/login`
- [ ] Call `POST /api/admin/login` with email and password
- [ ] Handle success response (cookie is set automatically)
- [ ] Store admin info in state/context (from response body)
- [ ] Redirect to admin dashboard on success

### Step 3: Update Admin Logout Flow
- [ ] Call `POST /api/admin/logout` with credentials
- [ ] Clear admin state/context
- [ ] Redirect to login page

### Step 4: Implement Route Guards
- [ ] Create admin route guard/middleware
- [ ] Check if admin is authenticated (try fetching protected resource)
- [ ] Redirect to login if 401 Unauthorized
- [ ] Protect all admin pages with this guard

### Step 5: Update API Calls
- [ ] Update `getAllVendors` call to include credentials
- [ ] Update `updateCommission` call to include credentials
- [ ] Update `deleteAdmin` call to use URL param instead of query
- [ ] Verify all other admin calls include credentials

### Step 6: Error Handling
- [ ] Handle 401 Unauthorized errors globally
- [ ] Redirect to login on 401
- [ ] Show appropriate error messages
- [ ] Handle 403 Forbidden (insufficient permissions)

---

## 💡 Example Implementation

### Admin API Service (Recommended Pattern)

```javascript
// services/adminApi.js
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class AdminAPI {
  // Login
  async login(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }
    
    return response.json();
  }

  // Logout
  async logout() {
    const response = await fetch(`${API_BASE_URL}/api/admin/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    
    return response.json();
  }

  // Get all vendors
  async getAllVendors(filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await fetch(
      `${API_BASE_URL}/api/admin/vendors/get-all?${params}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );
    
    if (response.status === 401) {
      // Redirect to login or throw error
      throw new Error('Unauthorized - Please login');
    }
    
    return response.json();
  }

  // Approve vendor
  async approveVendor(vendorId) {
    const response = await fetch(
      `${API_BASE_URL}/api/admin/vendors/approve?vendorId=${vendorId}`,
      {
        method: 'PATCH',
        credentials: 'include',
      }
    );
    
    if (response.status === 401) {
      throw new Error('Unauthorized - Please login');
    }
    
    return response.json();
  }

  // Delete admin (updated to use URL param)
  async deleteAdmin(adminId) {
    const response = await fetch(
      `${API_BASE_URL}/api/admin/delete/${adminId}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );
    
    if (response.status === 401) {
      throw new Error('Unauthorized - Please login');
    }
    
    return response.json();
  }

  // Update commission
  async updateCommission(commissionRate) {
    const response = await fetch(
      `${API_BASE_URL}/api/admin/vendors/commission`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionRate }),
      }
    );
    
    if (response.status === 401) {
      throw new Error('Unauthorized - Please login');
    }
    
    return response.json();
  }
}

export default new AdminAPI();
```

### Admin Context/State Management

```javascript
// contexts/AdminContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import adminAPI from '../services/adminApi';

const AdminContext = createContext();

export function AdminProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check if admin is authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Try to fetch admin data (requires auth)
      const response = await adminAPI.getAllAdmins();
      if (response.success) {
        // Admin is authenticated
        setLoading(false);
      }
    } catch (error) {
      // Not authenticated
      setAdmin(null);
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await adminAPI.login(email, password);
      if (response.success) {
        setAdmin(response.admin);
        router.push('/admin/dashboard');
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await adminAPI.logout();
      setAdmin(null);
      router.push('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AdminContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
```

### Admin Route Guard

```javascript
// components/AdminRoute.jsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAdmin } from '../contexts/AdminContext';

export default function AdminRoute({ children }) {
  const { admin, loading } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !admin) {
      router.push('/admin/login');
    }
  }, [admin, loading, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!admin) {
    return null;
  }

  return children;
}
```

### Admin Login Page

```javascript
// pages/admin/login.jsx
import { useState } from 'react';
import { useAdmin } from '../../contexts/AdminContext';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAdmin();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const result = await login(email, password);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="login-container">
      <h1>Admin Login</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
```

---

## ⚠️ Common Pitfalls to Avoid

### ❌ DON'T DO THIS:
```javascript
// Missing credentials
fetch('/api/admin/vendors/get-all', {
  method: 'GET',
  // ❌ No credentials: 'include'
});

// Trying to pass admin ID manually
fetch('/api/admin/vendors/approve?adminId=123&vendorId=456', {
  // ❌ Don't pass adminId - it comes from cookie
  credentials: 'include',
});

// Using old delete endpoint
fetch('/api/admin/delete?id=123', {
  // ❌ Old format - should use URL param
  method: 'DELETE',
  credentials: 'include',
});
```

### ✅ DO THIS:
```javascript
// Include credentials
fetch('/api/admin/vendors/get-all', {
  method: 'GET',
  credentials: 'include', // ✅ Required
});

// Admin identity from cookie
fetch('/api/admin/vendors/approve?vendorId=456', {
  // ✅ Only vendorId needed - admin from cookie
  method: 'PATCH',
  credentials: 'include',
});

// Use URL param for delete
fetch('/api/admin/delete/123', {
  // ✅ ID in URL path
  method: 'DELETE',
  credentials: 'include',
});
```

---

## 🧪 Testing Checklist

- [ ] Admin can login successfully
- [ ] Admin cookie is set after login
- [ ] Protected routes work with cookie
- [ ] 401 errors redirect to login
- [ ] Logout clears cookie and redirects
- [ ] All vendor management actions work
- [ ] All user management actions work
- [ ] Category management works
- [ ] Delete admin uses correct endpoint format
- [ ] Update commission requires authentication

---

## 📞 Support

If you encounter any issues:
1. Check browser console for errors
2. Verify `credentials: 'include'` is set on all admin API calls
3. Check Network tab to confirm cookie is being sent
4. Ensure backend is running on correct port (3001)
5. Check CORS configuration allows credentials

---

## 🎯 Summary

**Key Changes:**
1. All admin routes now require authentication via HTTP-only cookie
2. Three previously unprotected routes now require auth
3. Delete admin endpoint changed from query param to URL param
4. Must use `credentials: 'include'` on ALL admin API calls

**Action Required:**
Update your admin API service to include credentials on all requests and handle authentication properly.

Good luck! 🚀
