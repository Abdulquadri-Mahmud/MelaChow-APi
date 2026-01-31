import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';
import { sendTokenCookie } from '../utils/sendTokenCookie.js';
import { generateAccessToken, generateRefreshToken } from '../utils/generateTokens.js';

export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.otp || String(user.otp) !== String(otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    // ✅ Mark user as verified upon successful OTP verification
    user.isVerified = true;

    // Clear OTP fields
    user.otp = null;
    user.otpExpires = null;

    await user.save();

    // Generate Tokens
    const accessToken = generateAccessToken({ id: user._id, role: user.role || 'user' });
    const refreshToken = generateRefreshToken({ id: user._id, role: user.role || 'user' });

    // Set HTTP-only Cookie (Refresh Token - Primary Authority)
    sendTokenCookie(res, refreshToken, "token");

    // Convert to plain JS object and remove sensitive data
    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.otp;
    delete userObj.otpExpires;

    res.status(200).json({
      success: true,
      message: 'Login successful! User verified.',
      accessToken, // Short-lived token for Request Authorization
      user: userObj,
    });

  } catch (err) {
    console.error('OTP Verification Error:', err);
    res.status(500).json({ message: 'OTP verification failed', error: err.message });
  }
};
