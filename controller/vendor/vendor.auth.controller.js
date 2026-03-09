import Vendor from '../../model/vendor/vendor.model.js';
import { generateAccessToken, generateRefreshToken, generateOTP, generateResetToken, verifyToken } from '../../utils/jwt.js';
import { sendMail } from '../../config/mailer.js';
import { sendTokenCookie } from '../../utils/sendTokenCookie.js';

// ============================================
// VENDOR REGISTRATION (with OTP verification)
// ============================================

export const registerVendor = async (req, res) => {
  try {
    const { email, name, phone, storeName, deliveryManagedBy, flatRateDeliveryFee } = req.body;

    // Validate input
    if (!email || !name || !storeName) {
      return res.status(400).json({ message: 'Email, Name, and Store Name are required' });
    }

    // Check if vendor exists
    const existingVendor = await Vendor.findOne({ email });
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
      existingVendor.name = name || existingVendor.name;
      existingVendor.phone = phone || existingVendor.phone;
      existingVendor.storeName = storeName || existingVendor.storeName;

      if (deliveryManagedBy) existingVendor.deliveryManagedBy = deliveryManagedBy;
      if (flatRateDeliveryFee !== undefined) existingVendor.flatRateDeliveryFee = flatRateDeliveryFee;

      await existingVendor.save();
    } else {
      // Create new vendor
      await Vendor.create({
        email,
        name,
        phone,
        storeName,
        otp,
        otpExpires,
        verified: false,
        deliveryManagedBy: deliveryManagedBy || "admin",
        flatRateDeliveryFee: flatRateDeliveryFee || 0
      });
    }

    // Send OTP email
    await sendMail({
      to: email,
      subject: 'Verify Your Vendor Account - GrubDash',
      html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f7fb; padding: 40px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background-color: #FF6B00; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">GrubDash Vendor</h1>
          </div>

          <!-- Body -->
          <div style="padding: 30px; text-align: center;">
            <h2 style="color: #222; margin-bottom: 10px;">Vendor Email Verification</h2>
            <p style="color: #555; font-size: 15px; line-height: 1.6;">
              Use the OTP below to verify your email address and complete your GrubDash Vendor registration:
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
              &copy; ${new Date().getFullYear()} GrubDash. All rights reserved.  
              <br/>This is an automated message, please do not reply.
            </p>
          </div>
        </div>
      </div>
      `
    });

    res.status(200).json({
      message: 'Verification code sent to your email',
      email
    });

  } catch (error) {
    console.error('Vendor registration error:', error);
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
    if (vendor.otp !== otp) {
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
    console.error('Vendor verification error:', error);
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
      return res.status(200).json({
        success: true,
        message: 'Password set successfully. Your account is currently pending admin approval. You will receive an email once your account is activated.',
        requiresApproval: true
      });
    }

    // Generate tokens (only if already approved - rare case but possible for re-registrations)
    const accessToken = generateAccessToken(vendor._id, 'vendor');
    const refreshToken = generateRefreshToken(vendor._id, 'vendor');

    // Set HttpOnly cookie
    sendTokenCookie(res, refreshToken, 'vendorToken');

    // Return vendor data (exclude password)
    const vendorResponse = vendor.getPublicProfile();

    res.status(200).json({
      message: 'Password set successfully',
      vendor: vendorResponse,
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Set password error:', error);
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
    sendTokenCookie(res, refreshToken, 'vendorToken');

    // Return vendor data
    const vendorResponse = vendor.getPublicProfile();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      vendor: vendorResponse,
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Vendor login error:', error);
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
      subject: 'Reset Your Vendor Password - GrubDash',
      html: `
      <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9fafb; padding: 30px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <div style="background-color: #FF6B00; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">GrubDash Vendor</h1>
          </div>
          <div style="padding: 30px; color: #333;">
              <h2 style="color: #FF6B00; margin-bottom: 15px;">Reset Password OTP</h2>
              <p>We received a request to reset your <strong>GrubDash Vendor</strong> password. Use the OTP below to proceed:</p>
              <div style="text-align: center; font-size: 28px; font-weight: bold; color: #FF6B00; margin: 25px 0;">${otp}</div>
              <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          </div>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #777;">
              © ${new Date().getFullYear()} GrubDash. All rights reserved.
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
    console.error('Vendor forgot password error:', error);
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

    if (vendor.otp !== otp) {
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
      message: 'Reset code verified',
      resetToken
    });

  } catch (error) {
    console.error('Verify reset code error:', error);
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
    sendTokenCookie(res, refreshToken, 'vendorToken');

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      vendor: vendor.getPublicProfile(),
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Vendor reset password error:', error);
    res.status(500).json({ message: 'Password reset failed', error: error.message });
  }
};

// ============================================
// TOKEN REFRESH
// ============================================

export const refreshVendorToken = async (req, res) => {
  try {
    const token = req.cookies.vendorToken;

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
    console.error('Refresh token error:', error);
    res.status(401).json({ message: 'Token refresh failed', error: error.message });
  }
};

export const vendorLogout = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === "production";

    res.clearCookie("vendorToken", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during logout",
    });
  }
};