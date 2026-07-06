import Vendor from '../../model/vendor/vendor.model.js';
import { generateAccessToken, generateRefreshToken, generateOTP, generateResetToken, verifyToken } from '../../utils/jwt.js';
import { sendMail } from '../../config/mailer.js';
import { sendAuthCookies } from '../../utils/sendTokenCookie.js';
import jwt from "jsonwebtoken";
import { blockToken } from "../../middleware/tokenBlocklist.js";
import { createTransferRecipient, resolveBankAccount } from '../../services/bank.service.js';
import { validateVendorLocation } from '../../services/locationService.js';

const CURRENT_VENDOR_TERMS_VERSION = "vendor-terms-2026-05-12";

const getRequestIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
};

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const resolveAndBuildPayoutDetails = async (payoutDetails = {}) => {
  const bankName = normalizeText(payoutDetails.bankName);
  const bankCode = normalizeText(payoutDetails.bankCode);
  const accountNumber = normalizeText(payoutDetails.accountNumber).replace(/\D/g, "");

  if (!bankName || !bankCode || !accountNumber) {
    throw new Error("Bank name, bank code, and account number are required");
  }

  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error("Account number must be 10 digits");
  }

  const accountName = await resolveBankAccount(accountNumber, bankCode);
  if (!accountName) {
    throw new Error("Could not verify bank account details");
  }

  const recipientCode = await createTransferRecipient({
    name: accountName,
    account_number: accountNumber,
    bank_code: bankCode,
  });

  return {
    bankName,
    bankCode,
    accountName,
    accountNumber,
    recipientCode,
    payoutMethod: "paystack",
    payoutEnabled: true,
  };
};

// ============================================
// VENDOR REGISTRATION (with OTP verification)
// ============================================

export const registerVendor = async (req, res) => {
  try {
    const {
      email,
      name,
      phone,
      storeName,
      storeDescription,
      logo,
      cuisineTypes,
      address,
      openingHours,
      payoutDetails,
      termsAccepted,
      termsVersion,
    } = req.body;

    const normalizedEmail = normalizeText(email).toLowerCase();
    const normalizedName = normalizeText(name);
    const normalizedPhone = normalizeText(phone);
    const normalizedStoreName = normalizeText(storeName);
    const normalizedStoreDescription = normalizeText(storeDescription);
    const normalizedAddress = {
      street: normalizeText(address?.street),
      city: normalizeText(address?.city),
      state: normalizeText(address?.state),
      postalCode: normalizeText(address?.postalCode),
    };

    // Validate input
    if (!normalizedEmail || !normalizedName || !normalizedPhone || !normalizedStoreName) {
      return res.status(400).json({ message: 'Email, name, phone, and store name are required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (!normalizedStoreDescription) {
      return res.status(400).json({ message: 'Store description is required' });
    }

    if (!logo || !Array.isArray(cuisineTypes) || cuisineTypes.length === 0) {
      return res.status(400).json({ message: 'Store logo and at least one cuisine type are required' });
    }

    if (!normalizedAddress.street || !normalizedAddress.city || !normalizedAddress.state) {
      return res.status(400).json({ message: 'Street address, city, and state are required' });
    }

    if (termsAccepted !== true) {
      return res.status(400).json({
        message: "You must accept the MelaChow Vendor Terms and Policy before registration",
      });
    }

    const termsAcceptance = {
      accepted: true,
      acceptedAt: new Date(),
      version: termsVersion || CURRENT_VENDOR_TERMS_VERSION,
      source: "registration",
      ipAddress: getRequestIp(req),
      userAgent: req.headers["user-agent"] || "",
    };

    // Check if vendor exists
    let verifiedPayoutDetails;
    try {
      verifiedPayoutDetails = await resolveAndBuildPayoutDetails(payoutDetails);
    } catch (error) {
      return res.status(400).json({
        message: error.message || "Bank account verification failed. Please check the bank and account number.",
      });
    }

    const existingVendor = await Vendor.findOne({ email: normalizedEmail });
    if (existingVendor && existingVendor.verified) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existingVendor) {
      // Update existing unverified vendor
      existingVendor.otp = otp;
      existingVendor.otpExpires = otpExpires;
      existingVendor.name = normalizedName || existingVendor.name;
      existingVendor.phone = normalizedPhone || existingVendor.phone;
      existingVendor.storeName = normalizedStoreName || existingVendor.storeName;

      if (normalizedStoreDescription) existingVendor.storeDescription = normalizedStoreDescription;
      if (logo) existingVendor.logo = logo;
      if (cuisineTypes?.length) existingVendor.cuisineTypes = cuisineTypes;
      if (address) {
        existingVendor.address = {
          street: normalizedAddress.street || existingVendor.address?.street || "",
          city: normalizedAddress.city || existingVendor.address?.city || "",
          state: normalizedAddress.state || existingVendor.address?.state || "",
          postalCode: normalizedAddress.postalCode || existingVendor.address?.postalCode || "",
        };
        // Validate location and set cityId/stateId
        const locationData = await validateVendorLocation(
          normalizedAddress.state || existingVendor.address?.state,
          normalizedAddress.city || existingVendor.address?.city
        );
        existingVendor.stateId = locationData.stateId || null;
        existingVendor.cityId = locationData.cityId || null;
        existingVendor.locationStatus = locationData.locationStatus;
        existingVendor.requestedState = locationData.requestedState || "";
        existingVendor.requestedCity = locationData.requestedCity || "";
      }
      if (openingHours) existingVendor.openingHours = openingHours;
      existingVendor.payoutDetails = verifiedPayoutDetails;

      // Delivery management is strictly platform-managed
      existingVendor.deliveryManagedBy = "admin";
      existingVendor.termsAcceptance = termsAcceptance;

      await existingVendor.save();
    } else {
      // Validate location and get cityId/stateId
      let locationData = { stateId: null, cityId: null, locationStatus: null, requestedState: "", requestedCity: "" };
      if (normalizedAddress.state && normalizedAddress.city) {
        locationData = await validateVendorLocation(normalizedAddress.state, normalizedAddress.city);
      }

      // Create new vendor
      await Vendor.create({
        email: normalizedEmail,
        name: normalizedName,
        phone: normalizedPhone,
        storeName: normalizedStoreName,
        storeDescription: normalizedStoreDescription,
        logo: logo || "",
        cuisineTypes: cuisineTypes || [],
        address: {
          street: normalizedAddress.street,
          city: normalizedAddress.city,
          state: normalizedAddress.state,
          postalCode: normalizedAddress.postalCode,
        },
        stateId: locationData.stateId || null,
        cityId: locationData.cityId || null,
        locationStatus: locationData.locationStatus,
        requestedState: locationData.requestedState || "",
        requestedCity: locationData.requestedCity || "",
        openingHours: openingHours || undefined,
        payoutDetails: verifiedPayoutDetails,
        otp,
        otpExpires,
        verified: false,
        deliveryManagedBy: "admin",
        termsAcceptance,
      });
    }

    // Send OTP email
    await sendMail({
      to: normalizedEmail,
      subject: 'Verify Your Vendor Account - MelaChow',
      html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f7fb; padding: 40px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background-color: #FF6B00; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MelaChow Vendor</h1>
          </div>

          <!-- Body -->
          <div style="padding: 30px; text-align: center;">
            <h2 style="color: #222; margin-bottom: 10px;">Vendor Email Verification</h2>
            <p style="color: #555; font-size: 15px; line-height: 1.6;">
              Use the OTP below to verify your email address and complete your MelaChow Vendor registration:
            </p>

            <div style="font-size: 32px; font-weight: bold; margin: 25px 0; color: #FF6B00; letter-spacing: 3px;">
              ${otp}
            </div>

            <p style="color: #777; font-size: 14px; line-height: 1.6;">
              This OTP will expire in <strong>10 minutes</strong>.  
              Please do not share this code with anyone for your account safety.
            </p>
          </div>

          <!-- Footer -->
          <hr style="border: none; border-top: 1px solid #eee; margin: 0;" />
          <div style="padding: 20px; text-align: center;">
            <p style="font-size: 12px; color: #aaa; margin: 0;">
              &copy; ${new Date().getFullYear()} MelaChow. All rights reserved.  
              <br/>This is an automated message, please do not reply.
            </p>
          </div>
        </div>
      </div>
      `
    });

    res.status(200).json({
      message: 'Verification code sent to your email',
      email: normalizedEmail
    });

  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

// ============================================
// VERIFY REGISTRATION OTP
// ============================================

export const verifyVendorRegistration = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // Find vendor with OTP
    const vendor = await Vendor.findOne({ email }).select('+otp +otpExpires');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    // Check if OTP matches and not expired
    if (String(vendor.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (vendor.otpExpires < Date.now()) {
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    }

    // Mark as verified
    vendor.verified = true;
    vendor.otp = undefined;
    vendor.otpExpires = undefined;
    await vendor.save();

    res.status(200).json({
      message: 'Account verified successfully. Please set your password.',
      email: vendor.email,
      requiresPassword: !vendor.password
    });

  } catch (error) {
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
};

// ============================================
// SET PASSWORD (after registration)
// ============================================

export const setVendorPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const vendor = await Vendor.findOne({ email, verified: true }).select('+password');

    if (!vendor) {
      return res.status(404).json({ message: 'Verified vendor not found' });
    }

    if (vendor.password) {
      return res.status(400).json({ message: 'Password already set. Use login instead.' });
    }

    // Set password (will be hashed by pre-save hook)
    vendor.password = password;
    vendor.lastLogin = Date.now();
    await vendor.save();

    // If not approved, notify but don't log in
    if (!vendor.isApproved) {
      // Notify admins about new vendor registration (Non-blocking)
      try {
        const { notifyAdmins } = await import('../../services/notification.service.js');
        notifyAdmins('admin_new_vendor', { 
            storeName: vendor.storeName,
            url: `/admin/vendors/pending/${vendor._id}` 
        }).catch(err => console.error("Admin notification failed:", err.message));
      } catch (err) {
        console.error("Failed to import notification service:", err.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Password set successfully. Your account is currently pending admin approval. You will receive an email once your account is activated.',
        requiresApproval: true
      });
    }

    // Generate tokens (only if already approved - rare case but possible for re-registrations)
    const accessToken = generateAccessToken(vendor._id, 'vendor');
    sendAuthCookies(res, accessToken, token, 'vendor');
    const refreshToken = generateRefreshToken(vendor._id, 'vendor');

    // Set HttpOnly cookie
    sendAuthCookies(res, accessToken, refreshToken, 'vendor');

    // Return vendor data (exclude password)
    const vendorResponse = vendor.getPublicProfile();

    res.status(200).json({
      message: 'Password set successfully',
      vendor: vendorResponse,
      accessToken
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to set password', error: error.message });
  }
};

// ============================================
// LOGIN (with email + password)
// ============================================

export const loginVendorWithPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find vendor with password field
    const vendor = await Vendor.findOne({ email }).select('+password +loginAttempts +lockUntil');

    if (!vendor) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if account is verified (email)
    if (!vendor.verified) {
      return res.status(401).json({
        message: 'Email not verified. Please verify your email first.',
        requiresVerification: true
      });
    }

    // Check if account is approved by admin
    if (!vendor.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval. You will be notified via email once approved.',
        requiresApproval: true
      });
    }

    // Check if account is suspended/inactive
    if (vendor.suspended || (vendor.active === false)) {
      return res.status(401).json({ message: 'Account suspended or inactive. Please contact support.' });
    }

    // Check if account is locked
    if (vendor.isLocked()) {
      return res.status(423).json({
        message: 'Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.'
      });
    }

    // Check if password is set
    if (!vendor.password) {
      return res.status(400).json({
        message: 'Password not set. Please complete verification process.',
        requiresPasswordSetup: true
      });
    }

    // Compare password
    const isPasswordValid = await vendor.comparePassword(password);

    if (!isPasswordValid) {
      // Increment failed attempts
      await vendor.incLoginAttempts();

      const attemptsLeft = 5 - (vendor.loginAttempts + 1);
      if (attemptsLeft > 0) {
        return res.status(401).json({
          message: `Invalid email or password. ${attemptsLeft} attempts remaining.`
        });
      } else {
        return res.status(423).json({
          message: 'Account locked due to multiple failed attempts. Try again in 15 minutes.'
        });
      }
    }

    // Reset login attempts
    await vendor.resetLoginAttempts();

    // Generate tokens
    const accessToken = generateAccessToken(vendor._id, 'vendor');
    const refreshToken = generateRefreshToken(vendor._id, 'vendor');

    // Set HttpOnly cookie
    sendAuthCookies(res, accessToken, refreshToken, 'vendor');

    // Return vendor data
    const vendorResponse = vendor.getPublicProfile();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      vendor: vendorResponse,
      accessToken
    });

  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

// ============================================
// FORGOT PASSWORD
// ============================================

export const vendorForgotPasswordNew = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const vendor = await Vendor.findOne({ email, verified: true }).select('+otp +otpExpires');

    if (!vendor) {
      return res.status(200).json({
        message: 'If an account exists with this email, a reset code will be sent.'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    vendor.otp = otp;
    vendor.otpExpires = otpExpires;
    await vendor.save();

    // Send reset email
    await sendMail({
      to: email,
      subject: 'Reset Your Vendor Password - MelaChow',
      html: `
      <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9fafb; padding: 30px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <div style="background-color: #FF6B00; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">MelaChow Vendor</h1>
          </div>
          <div style="padding: 30px; color: #333;">
              <h2 style="color: #FF6B00; margin-bottom: 15px;">Reset Password OTP</h2>
              <p>We received a request to reset your <strong>MelaChow Vendor</strong> password. Use the OTP below to proceed:</p>
              <div style="text-align: center; font-size: 28px; font-weight: bold; color: #FF6B00; margin: 25px 0;">${otp}</div>
              <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          </div>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #777;">
              Â© ${new Date().getFullYear()} MelaChow. All rights reserved.
          </div>
        </div>
      </div>
      `
    });

    res.status(200).json({
      message: 'Password reset code sent to your email',
      email
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to send reset code', error: error.message });
  }
};

// ============================================
// VERIFY RESET CODE
// ============================================

export const verifyVendorResetCode = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    const vendor = await Vendor.findOne({ email }).select('+otp +otpExpires');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    if (String(vendor.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    if (vendor.otpExpires < Date.now()) {
      return res.status(400).json({ message: 'Reset code expired' });
    }

    // Generate reset token
    const resetToken = generateResetToken();

    vendor.resetPasswordToken = resetToken;
    vendor.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    vendor.otp = undefined;
    vendor.otpExpires = undefined;
    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Reset code verified',
      resetToken
    });

  } catch (error) {
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
};

// ============================================
// RESET PASSWORD
// ============================================

export const resetVendorPasswordNew = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ message: 'Email, reset token, and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const vendor = await Vendor.findOne({
      email,
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+resetPasswordToken +resetPasswordExpires +password');

    if (!vendor) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Set new password
    vendor.password = newPassword;
    vendor.resetPasswordToken = undefined;
    vendor.resetPasswordExpires = undefined;
    vendor.loginAttempts = 0;
    vendor.lockUntil = undefined;
    vendor.lastLogin = Date.now();
    await vendor.save();

    // Generate tokens
    const accessToken = generateAccessToken(vendor._id, 'vendor');
    const refreshToken = generateRefreshToken(vendor._id, 'vendor');

    // Set HttpOnly cookie
    sendAuthCookies(res, accessToken, refreshToken, 'vendor');

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      vendor: vendor.getPublicProfile(),
      accessToken
    });

  } catch (error) {
    res.status(500).json({ message: 'Password reset failed', error: error.message });
  }
};

// ============================================
// TOKEN REFRESH
// ============================================

export const refreshVendorToken = async (req, res) => {
  try {
    const token = req.cookies.vendorRefreshToken || req.cookies.vendorToken;

    if (!token) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    // Verify token
    const decoded = verifyToken(token);

    if (decoded.type !== 'refresh' || decoded.role !== 'vendor') {
      return res.status(401).json({ message: 'Invalid token type or role' });
    }

    const vendor = await Vendor.findById(decoded.id);

    if (!vendor || vendor.suspended || !vendor.active || !vendor.isApproved) {
      return res.status(401).json({ message: 'Vendor not found, inactive, or pending approval' });
    }

    // Generate new access token
    const accessToken = generateAccessToken(vendor._id, 'vendor');

    res.status(200).json({
      success: true,
      accessToken
    });

  } catch (error) {
    res.status(401).json({ message: 'Token refresh failed', error: error.message });
  }
};

export const vendorLogout = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === "production";

    // Block the current token if it exists
    const token = req.cookies?.vendorToken;
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded?.exp) {
          await blockToken(token, decoded.exp);
        }
      } catch (e) {
        // Token blocking failed
      }
    }

    res.clearCookie("vendorToken", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
    });
    res.clearCookie('vendorRefreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error during logout",
    });
  }
};
