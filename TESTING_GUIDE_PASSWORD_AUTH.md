# 🧪 QUICK TESTING GUIDE - New Password Auth

## Prerequisites
- Backend running on: `https://grub-dash-api.vercel.app` (or `http://localhost:3001`)
- API testing tool: Postman, Thunder Client, or curl

---

## 1️⃣ REGISTRATION FLOW (3 Steps)

### Step 1: Register
```http
POST /api/user/auth/register
Content-Type: application/json

{
  "email": "testuser@example.com",
  "firstname": "Test",
  "lastname": "User",
  "phone": "+1234567890"
}
```
**Expected Response:**
```json
{
  "message": "Verification code sent to your email",
  "email": "testuser@example.com"
}
```
**Action:** Check email for 6-digit OTP

---

### Step 2: Verify OTP
```http
POST /api/user/auth/verify-registration
Content-Type: application/json

{
  "email": "testuser@example.com",
  "otp": "123456"
}
```
**Expected Response:**
```json
{
  "message": "Account verified successfully. Please set your password.",
  "email": "testuser@example.com",
  "requiresPassword": true
}
```

---

### Step 3: Set Password
```http
POST /api/user/auth/set-password
Content-Type: application/json

{
  "email": "testuser@example.com",
  "password": "SecurePass123!"
}
```
**Expected Response:**
```json
{
  "message": "Password set successfully",
  "user": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
**Check:** Cookie `token` should be set in response headers

---

## 2️⃣ LOGIN FLOW (1 Step)

### Login with Password
```http
POST /api/user/auth/login-password
Content-Type: application/json

{
  "email": "testuser@example.com",
  "password": "SecurePass123!"
}
```
**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
**Check:** Cookie `token` should be set

---

## 3️⃣ PASSWORD RESET FLOW (3 Steps)

### Step 1: Request Reset
```http
POST /api/user/auth/forgot-password-new
Content-Type: application/json

{
  "email": "testuser@example.com"
}
```
**Expected Response:**
```json
{
  "message": "Password reset code sent to your email",
  "email": "testuser@example.com"
}
```
**Action:** Check email for reset OTP

---

### Step 2: Verify Reset Code
```http
POST /api/user/auth/verify-reset-code
Content-Type: application/json

{
  "email": "testuser@example.com",
  "otp": "654321"
}
```
**Expected Response:**
```json
{
  "message": "Reset code verified",
  "resetToken": "a1b2c3d4e5f6..."
}
```
**Action:** Save the `resetToken` for next step

---

### Step 3: Reset Password
```http
POST /api/user/auth/reset-password-new
Content-Type: application/json

{
  "email": "testuser@example.com",
  "resetToken": "a1b2c3d4e5f6...",
  "newPassword": "NewSecurePass456!"
}
```
**Expected Response:**
```json
{
  "success": true,
  "message": "Password reset successful",
  "user": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
**Check:** Cookie `token` should be set

---

## 4️⃣ PROTECTED ROUTES

### Get Profile
```http
GET /api/user/auth/profile
Cookie: token=<refresh_token_from_login>
```
**Expected Response:**
```json
{
  "status": true,
  "user": {
    "_id": "...",
    "email": "testuser@example.com",
    "firstname": "Test",
    "lastname": "User",
    ...
  }
}
```

---

### Logout
```http
POST /api/user/auth/logout
Cookie: token=<refresh_token>
```
**Expected Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```
**Check:** Cookie `token` should be cleared

---

## 5️⃣ TOKEN REFRESH

### Refresh Access Token
```http
POST /api/user/auth/refresh
Cookie: token=<refresh_token>
```
**Expected Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 6️⃣ SECURITY TESTS

### Test Account Locking
1. Login with wrong password 5 times:
```http
POST /api/user/auth/login-password
Content-Type: application/json

{
  "email": "testuser@example.com",
  "password": "WrongPassword123!"
}
```

**After 5 attempts, expected response:**
```json
{
  "message": "Account locked due to multiple failed attempts. Try again in 15 minutes."
}
```

2. Wait 15 minutes or reset via admin
3. Try login again with correct password

---

### Test Password Validation
```http
POST /api/user/auth/set-password
Content-Type: application/json

{
  "email": "testuser@example.com",
  "password": "short"
}
```
**Expected Response:**
```json
{
  "message": "Password must be at least 8 characters"
}
```

---

### Test OTP Expiration
1. Register and get OTP
2. Wait 11 minutes
3. Try to verify OTP

**Expected Response:**
```json
{
  "message": "OTP expired. Please request a new one."
}
```

---

## 🎯 SUCCESS CRITERIA

✅ **Registration:**
- [ ] OTP sent to email
- [ ] OTP verification works
- [ ] Password set successfully
- [ ] Cookie set in response

✅ **Login:**
- [ ] Login with correct password works
- [ ] Login with wrong password fails
- [ ] Account locks after 5 failed attempts
- [ ] Cookie set in response

✅ **Password Reset:**
- [ ] Reset OTP sent to email
- [ ] OTP verification returns reset token
- [ ] Password reset works
- [ ] Can login with new password

✅ **Security:**
- [ ] Password not in API responses
- [ ] OTP not in API responses
- [ ] HttpOnly cookie set
- [ ] Account locking works
- [ ] OTP expires after 10 minutes

---

## 🐛 TROUBLESHOOTING

### "User not found"
- Check email spelling
- Ensure user registered successfully

### "Invalid OTP"
- Check OTP from email (6 digits)
- OTP expires in 10 minutes
- Request new OTP if expired

### "Token expired"
- Use refresh token endpoint
- Login again if refresh fails

### "Account locked"
- Wait 15 minutes
- Or contact admin to unlock

### "Password comparison failed"
- User hasn't set password yet
- Complete registration flow first

---

## 📊 POSTMAN COLLECTION

Import this collection to Postman for easy testing:

```json
{
  "info": {
    "name": "GrubDash Password Auth",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Register",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/user/auth/register",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"test@example.com\",\n  \"firstname\": \"Test\",\n  \"lastname\": \"User\"\n}"
        }
      }
    },
    {
      "name": "2. Verify Registration",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/user/auth/verify-registration",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"test@example.com\",\n  \"otp\": \"123456\"\n}"
        }
      }
    },
    {
      "name": "3. Set Password",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/user/auth/set-password",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"SecurePass123!\"\n}"
        }
      }
    },
    {
      "name": "4. Login",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/user/auth/login-password",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"SecurePass123!\"\n}"
        }
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "https://grub-dash-api.vercel.app"
    }
  ]
}
```

---

**Ready to test!** 🚀
