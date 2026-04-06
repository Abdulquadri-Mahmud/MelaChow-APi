# ðŸ” AUTHENTICATION REFACTORING - PHASE 2 (VENDOR & ADMIN)

This phase completes the secure authentication system migration for **Vendors** and **Admins**. 
The system now uses consistent security patterns across all user types (User, Vendor, Admin).

---

## ðŸš€ NEW FEATURES IMPLEMENTED

### 1. Vendor Authentication (`via /api/vendor/auth/*`)
- **Model Updates**: Added `password`, `loginAttempts`, `lockUntil`, `resetPasswordToken` fields.
- **Registration**: Email verification -> Set Password -> Login.
- **Login**: Email + Password (replaces OTP-only login).
- **Security**: 
  - Account locking (5 failed attempts = 15 min lock).
  - HttpOnly Cookie (`vendorToken`) for session management.
  - Password Hashing (bcrypt strength 12).

### 2. Admin Authentication (`via /api/admin/auth/*`)
- **Model Updates**: Added `password` (enhanced), `loginAttempts`, `lockUntil`, `resetPasswordToken`.
- **Login**: Email + Password.
- **Security**: 
  - Consistent account locking policy.
  - HttpOnly Cookie (`adminToken`).
  - Strict role checks.

### 3. Route Updates
- **Vendor**: New routes at `/api/vendor/auth/` (register, login, reset-password).
- **Admin**: New routes at `/api/admin/auth/` (login, reset-password).
- **Backward Compatibility**: Kept legacy routes active created aliases to new logic where applicable.

---

## ðŸ› ï¸ TESTING GUIDE

### Vendor Login
**Endpoint**: `POST /api/vendor/auth/login-password`
```json
{
  "email": "vendor@melachow.com",
  "password": "SecureVendorPass1!"
}
```

### Admin Login
**Endpoint**: `POST /api/admin/auth/login`
```json
{
  "email": "admin@melachow.com",
  "password": "SecureAdminPass1!"
}
```

### Password Reset (Vendor Example)
1. **Request Reset**: `POST /api/vendor/auth/forgot-password` -> Sends OTP.
2. **Verify OTP**: `POST /api/vendor/auth/verify-reset-code` -> Returns `resetToken`.
3. **Set New Password**: `POST /api/vendor/auth/reset-password` (with `resetToken` + `newPassword`).

---

## âš ï¸ MIGRATION STEPS

Run the migration script to initialize new fields for existing vendors and admins:

```bash
node scripts/migrateUsers.js
node scripts/migrateVendorsAndAdmins.js # ðŸ‘ˆ Run this for Phase 2
```

---

## ðŸ”’ SECURITY SUMMARY

| Feature | Implementation | benefit |
| :--- | :--- | :--- |
| **Password Storage** | `bcryptjs` (salt rounds: 12) | Prevention against rainbow table attacks |
| **Session Mgmt** | HttpOnly Cookies (SameSite: Lax/None) | Mitigates XSS attacks (JS cannot read token) |
| **Brute Force** | Max 5 attempts -> 15 min lock | Prevents password guessing attacks |
| **Reset Flow** | OTP -> Short-lived Token | Secure 2-step verification |

---

## âœ… NEXT STEPS
1. **Frontend Update**: Update Vendor Dashboard and Admin Panel to use new `/auth` endpoints.
2. **Testing**: Verify flows for both new and existing accounts.
3. **Monitor**: Watch logs for any auth failures during rollout.

