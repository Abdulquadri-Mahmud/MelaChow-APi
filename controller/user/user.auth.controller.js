import User from '../../model/user.model.js';
import { generateAccessToken, generateRefreshToken, generateOTP, generateResetToken, verifyToken } from '../../utils/jwt.js';
import { sendMail } from '../../config/mailer.js';
import { sendAuthCookies } from '../../utils/sendTokenCookie.js';
import { wrapLayout } from '../../services/emailTemplate.service.js';

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
            subject: 'Verify Your Email: ' + otp,
            html: wrapLayout(
                'Welcome to MelaChow',
                `
                <p class="p">Your journey to delicious meals starts here. Use the secure code below to verify your email address and join our community.</p>
                <div style="background: #F3F4F6; border-radius: 20px; padding: 40px; text-align: center; margin: 32px 0; border: 2px dashed #E5E7EB;">
                    <span style="font-size: 40px; font-weight: 900; letter-spacing: 12px; color: #111827; font-family: 'Courier New', Courier, monospace;">
                        ${otp}
                    </span>
                </div>
                <p class="p" style="font-size: 14px; color: #6B7280; text-align: center;">
                    This code will expire in 10 minutes. If you didn't request this, please ignore this email.
                </p>
                `,
                'Join the Club'
            )
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
        if (String(user.otp).trim() !== String(otp).trim()) {
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
        sendAuthCookies(res, accessToken, refreshToken, 'user');

        // Return user data (exclude password)
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(200).json({
            message: 'Password set successfully',
            user: userResponse,
            accessToken
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
        sendAuthCookies(res, accessToken, refreshToken, 'user');

        // Return user data
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.loginAttempts;
        delete userResponse.lockUntil;

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: userResponse,
            accessToken
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

        await sendMail({
            to: email,
            subject: 'Reset Code: ' + otp,
            html: wrapLayout(
                'Password Reset',
                `
                <p class="p">We received a request to reset your password. If you didn't make this request, please secure your account immediately.</p>
                <div style="background: #FFFBEB; border-radius: 20px; padding: 40px; text-align: center; margin: 32px 0; border: 2px dashed #F59E0B;">
                    <span style="font-size: 40px; font-weight: 900; letter-spacing: 12px; color: #B45309; font-family: 'Courier New', Courier, monospace;">
                        ${otp}
                    </span>
                </div>
                <p class="p" style="font-size: 14px; color: #6B7280; text-align: center;">
                    This reset code will expire in 10 minutes. <b>Never share this code with anyone.</b>
                </p>
                `,
                'Reset Request'
            )
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

        if (String(user.otp).trim() !== String(otp).trim()) {
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
            success: true,
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
        sendAuthCookies(res, accessToken, refreshToken, 'user');

        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(200).json({
            success: true,
            message: 'Password reset successful',
            user: userResponse,
            accessToken
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
        const token = req.cookies.refreshToken || req.cookies.token;

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
        sendAuthCookies(res, accessToken, token, 'user');

        res.status(200).json({
            success: true,
            accessToken
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(401).json({ message: 'Token refresh failed', error: error.message });
    }
};

