import User from '../../model/user.model.js';
import { generateAccessToken, generateRefreshToken, generateOTP, generateResetToken, verifyToken } from '../../utils/jwt.js';
import { sendMail } from '../../config/mailer.js';
import { sendTokenCookie } from '../../utils/sendTokenCookie.js';

// ============================================
// USER REGISTRATION (with OTP verification)
// ============================================

export const register = async (req, res) => {
    try {
        const { email, firstname, lastname, phone } = req.body;

        // Validate input
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser.isVerified) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        if (existingUser) {
            // Update existing unverified user
            existingUser.otp = otp;
            existingUser.otpExpires = otpExpires;
            existingUser.firstname = firstname || existingUser.firstname;
            existingUser.lastname = lastname || existingUser.lastname;
            existingUser.phone = phone || existingUser.phone;
            await existingUser.save();
        } else {
            // Create new user
            await User.create({
                email,
                firstname,
                lastname,
                phone,
                otp,
                otpExpires,
                isVerified: false
            });
        }

        // Send OTP email
        await sendMail({
            to: email,
            subject: 'Verify Your Email - MelaChow',
            html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f7fb; padding: 40px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background-color: #FF6B00; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MelaChow</h1>
          </div>

          <!-- Body -->
          <div style="padding: 30px; text-align: center;">
            <h2 style="color: #222; margin-bottom: 10px;">Email Verification</h2>
            <p style="color: #555; font-size: 15px; line-height: 1.6;">
              Use the OTP below to verify your email address and complete your MelaChow registration:
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
            email
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Registration failed', error: error.message });
    }
};

// ============================================
// VERIFY REGISTRATION OTP
// ============================================

export const verifyRegistration = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        // Find user with OTP (need to explicitly select OTP fields)
        const user = await User.findOne({ email }).select('+otp +otpExpires');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if OTP matches and not expired
        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        if (user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }

        // Mark as verified
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.status(200).json({
            message: 'Account verified successfully. Please set your password.',
            email: user.email,
            requiresPassword: !user.password
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ message: 'Verification failed', error: error.message });
    }
};

// ============================================
// SET PASSWORD (after registration)
// ============================================

export const setPassword = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const user = await User.findOne({ email, isVerified: true }).select('+password');

        if (!user) {
            return res.status(404).json({ message: 'Verified user not found' });
        }

        if (user.password) {
            return res.status(400).json({ message: 'Password already set. Use login instead.' });
        }

        // Set password (will be hashed by pre-save hook)
        user.password = password;
        user.lastLogin = Date.now();
        await user.save();

        // Generate tokens
        const accessToken = generateAccessToken(user._id, 'user');
        const refreshToken = generateRefreshToken(user._id, 'user');

        // Set HttpOnly cookie
        sendTokenCookie(res, refreshToken, 'token');

        // Return user data (exclude password)
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(200).json({
            message: 'Password set successfully',
            user: userResponse,
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

export const loginWithPassword = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user with password field (explicitly select it)
        const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Check if account is verified
        if (!user.isVerified) {
            return res.status(401).json({
                message: 'Account not verified. Please verify your email first.',
                requiresVerification: true
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(401).json({ message: 'Account has been deactivated. Please contact support.' });
        }

        // Check if account is locked
        if (user.isLocked()) {
            return res.status(423).json({
                message: 'Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.'
            });
        }

        // Check if password is set
        if (!user.password) {
            return res.status(400).json({
                message: 'Password not set. Please complete registration.',
                requiresPasswordSetup: true
            });
        }

        // Compare password
        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            // Increment failed attempts
            await user.incLoginAttempts();

            const attemptsLeft = 5 - (user.loginAttempts + 1);
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

        // Reset login attempts on successful login
        await user.resetLoginAttempts();

        // Generate tokens
        const accessToken = generateAccessToken(user._id, 'user');
        const refreshToken = generateRefreshToken(user._id, 'user');

        // Set HttpOnly cookie
        sendTokenCookie(res, refreshToken, 'token');

        // Return user data
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.loginAttempts;
        delete userResponse.lockUntil;

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: userResponse,
            accessToken,
            refreshToken
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
};

// ============================================
// FORGOT PASSWORD (sends OTP)
// ============================================

export const forgotPasswordNew = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email, isVerified: true }).select('+otp +otpExpires');

        if (!user) {
            // Don't reveal if user exists (security)
            return res.status(200).json({
                message: 'If an account exists with this email, a reset code will be sent.'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        // Send reset email
        await sendMail({
            to: email,
            subject: 'Reset Your Password - MelaChow',
            html: `
      <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9fafb; padding: 30px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background-color: #FF6B00; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">MelaChow</h1>
              <p style="color: #ffeede; margin: 5px 0 0; font-size: 14px;">Bringing meals closer</p>
          </div>

          <!-- Body -->
          <div style="padding: 30px; color: #333;">
              <h2 style="color: #FF6B00; margin-bottom: 15px;">Reset Password OTP</h2>
              <p>Hello,</p>
              <p>We received a request to reset your <strong>MelaChow</strong> account password. Use the OTP below to proceed:</p>

              <div style="text-align: center; font-size: 28px; font-weight: bold; color: #FF6B00; margin: 25px 0;">
                  ${otp}
              </div>

              <p>This OTP is valid for <strong>10 minutes</strong>. For your safety, please don't share it with anyone.</p>

              <p>Thanks,<br/>The MelaChow Team</p>
          </div>

          <!-- Footer -->
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
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Failed to send reset code', error: error.message });
    }
};

// ============================================
// VERIFY RESET CODE
// ============================================

export const verifyResetCode = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and code are required' });
        }

        const user = await User.findOne({ email }).select('+otp +otpExpires +resetPasswordToken +resetPasswordExpires');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid reset code' });
        }

        if (user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Reset code expired' });
        }

        // Generate reset token
        const resetToken = generateResetToken();

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

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

export const resetPasswordNew = async (req, res) => {
    try {
        const { email, resetToken, newPassword } = req.body;

        if (!email || !resetToken || !newPassword) {
            return res.status(400).json({ message: 'Email, reset token, and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const user = await User.findOne({
            email,
            resetPasswordToken: resetToken,
            resetPasswordExpires: { $gt: Date.now() }
        }).select('+resetPasswordToken +resetPasswordExpires +password');

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        // Set new password (will be hashed by pre-save hook)
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        user.lastLogin = Date.now();
        await user.save();

        // Generate new session
        const accessToken = generateAccessToken(user._id, 'user');
        const refreshToken = generateRefreshToken(user._id, 'user');

        // Set HttpOnly cookie
        sendTokenCookie(res, refreshToken, 'token');

        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(200).json({
            success: true,
            message: 'Password reset successful',
            user: userResponse,
            accessToken,
            refreshToken
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Password reset failed', error: error.message });
    }
};

// ============================================
// REFRESH TOKEN
// ============================================

export const refreshToken = async (req, res) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({ message: 'No refresh token provided' });
        }

        // Verify refresh token
        const decoded = verifyToken(token);

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ message: 'Invalid token type' });
        }

        // Get user
        const user = await User.findById(decoded.id);

        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'User not found or inactive' });
        }

        // Generate new access token
        const accessToken = generateAccessToken(user._id, user.role);

        res.status(200).json({
            success: true,
            accessToken
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(401).json({ message: 'Token refresh failed', error: error.message });
    }
};

