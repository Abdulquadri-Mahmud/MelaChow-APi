import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import User from '../../model/user.model.js';
import { sendMail } from '../../config/mailer.js';
import { errorHandler } from '../../utils/errorHandler.js';

// In-memory token storage (or use DB in production)
// let verificationTokens = new Map();

// 📧 Email Verification

export const verifyEmail = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'Email already verified' });

    //Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    //Set OTP expiry to 10 minutes from now
    const otpExpires = Date.now() + 10 * 60 * 1000;

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    console.log(`OTP for ${email}: ${otp}`); // For debugging, remove in production

    await sendMail({
      to: email,
      subject: 'Verify Your Email - GrubDash',
      html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f7fb; padding: 40px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background-color: #1A73E8; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">GrubDash</h1>
          </div>

          <!-- Body -->
          <div style="padding: 30px; text-align: center;">
            <h2 style="color: #222; margin-bottom: 10px;">Email Verification</h2>
            <p style="color: #555; font-size: 15px; line-height: 1.6;">
              Use the OTP below to verify your email address and secure your GrubDash account:
            </p>

            <div style="font-size: 32px; font-weight: bold; margin: 25px 0; color: #1A73E8; letter-spacing: 3px;">
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

    return res.json({ message: 'OTP sent to your email for verification' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to send verification OTP', error: error.message });
  }
};

// Activate Email
export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // 2. Check if OTP matches and is still valid
    if (!user.otp || String(user.otp) !== String(otp) || !user.otpExpires || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // 3. Set new password and clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    res.json({ message: 'Email successfully verified' });

  } catch (error) {
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    //Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    //Set OTP expiry to 10 minutes from now
    const otpExpires = Date.now() + 10 * 60 * 1000;

    //Save OTP to the user
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    //Send OTP to email
    await sendMail({
      to: email,
      subject: 'Reset Your Password - GrubDash',
      html: `
      <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9fafb; padding: 30px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background-color: #FF6B00; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">GrubDash</h1>
              <p style="color: #ffeede; margin: 5px 0 0; font-size: 14px;">Bringing meals closer</p>
          </div>

          <!-- Body -->
          <div style="padding: 30px; color: #333;">
              <h2 style="color: #FF6B00; margin-bottom: 15px;">Reset Password OTP</h2>
              <p>Hello,</p>
              <p>We received a request to reset your <strong>GrubDash</strong> account password. Use the OTP below to proceed:</p>

              <div style="text-align: center; font-size: 28px; font-weight: bold; color: #FF6B00; margin: 25px 0;">
                  ${otp}
              </div>

              <p>This OTP is valid for <strong>10 minutes</strong>. For your safety, please don’t share it with anyone.</p>

              <p>Thanks,<br/>The GrubDash Team</p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #777;">
              © ${new Date().getFullYear()} GrubDash. All rights reserved.
          </div>
        </div>
      </div>
      `
    });

    return res.json({ message: 'OTP has been sent to your email' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error sending OTP', error: err.message });
  }
};

export const resetPassword = async (req, res) => {
  const { email, otp, password } = req.body;

  try {
    // 1. Find the user
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Check if OTP matches and is still valid
    if (
      !user.otp ||
      String(user.otp) !== String(otp) ||
      !user.otpExpires ||
      user.otpExpires < Date.now()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // 3. Hash new password
    const hashedPassword = bcryptjs.hashSync(password, 10);

    // Update user's password
    user.password = hashedPassword;
    // 4. Clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// User signup controller
// import bcrypt from "bcryptjs"; // not "bcrypt"

export const signup = async (req, res, next) => {
  const { firstname, lastname, email, addresses, avatar, phone, role } = req.body;

  try {

    const validEmail = await User.findOne({ email });

    const validPhone = await User.findOne({ phone });

    if (validEmail) {
      return next(errorHandler(404, 'Email has been used by another user!'))
    }
    if (validPhone) {
      return next(errorHandler(404, 'Phone number has been used by another user!'))
    }

    // Password logic removed for OTP auth

    const newUser = new User({ firstname, lastname, email, addresses, avatar, phone, role });

    await newUser.save();

    res.status(201).json('Account has been created succesffully!')

  } catch (error) {
    next(error)
  }
};

export const login = async (req, res, next) => {
  const { email } = req.body;

  try {

    // check if email is valid...
    const user = await User.findOne({ email });
    // check is email is not valid
    if (!user) {
      return next(errorHandler(404, 'User Not Found!'));
    }

    // Password check removed for OTP flow

    // OTP generation logic...
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendMail({
      to: user.email,
      subject: 'Your GrubDash Login OTP',
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9f9f9; padding: 30px;">
          <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

            <!-- Header -->
            <div style="background-color: #FF6600; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">GrubDash</h1>
              <p style="color: #ffe6d1; margin: 5px 0 0;">Bringing meals closer 🍴</p>
            </div>

            <!-- Body -->
            <div style="padding: 30px; color: #333;">
              <h2 style="color: #FF6600;">Login Verification OTP</h2>
              <p>Hey there 👋,</p>
              <p>To continue logging into your <strong>GrubDash</strong> account, please use the OTP code below. This code will expire in <strong>10 minutes</strong>:</p>

              <div style="text-align: center; margin: 30px 0;">
                <p style="font-size: 26px; font-weight: bold; letter-spacing: 4px; color: #FF6600;">${otp}</p>
              </div>

              <p>If you didn’t request this, please ignore this message — your account is safe.</p>

              <p>Stay hungry, stay connected 🍔,<br/><strong>The GrubDash Team</strong></p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #888;">
              © ${new Date().getFullYear()} GrubDash. All rights reserved.
            </div>
          </div>
        </div>
      `
    });

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
};

export const resendOtp = async (req, res, next) => {
  const { email } = req.body;

  try {
    // Check if email exists
    if (!email) {
      return next(errorHandler(400, "Email is required!"));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(errorHandler(404, "User not found!"));
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // expires in 10 min
    await user.save();

    // Send mail
    await sendMail({
      to: user.email,
      subject: "Your GrubDash OTP Code",
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9f9f9; padding: 30px;">
          <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background-color: #FF6600; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">GrubDash</h1>
              <p style="color: #ffe6d1; margin: 5px 0 0;">Bringing meals closer 🍴</p>
            </div>

            <!-- Body -->
            <div style="padding: 30px; color: #333;">
              <h2 style="color: #FF6600;">Resend OTP</h2>
              <p>Hello 👋,</p>
              <p>Here’s your new OTP code to verify your <strong>GrubDash</strong> account. This code will expire in <strong>10 minutes</strong>:</p>

              <div style="text-align: center; margin: 30px 0;">
                <p style="font-size: 26px; font-weight: bold; letter-spacing: 4px; color: #FF6600;">${otp}</p>
              </div>

              <p>If you didn’t request a new OTP, you can safely ignore this email.</p>

              <p>Stay hungry, stay connected 🍔,<br/><strong>The GrubDash Team</strong></p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #888;">
              © ${new Date().getFullYear()} GrubDash. All rights reserved.
            </div>
          </div>
        </div>
      `,
    });

    res.status(200).json({
      status: true,
      message: "A new OTP has been sent to your email.",
    });
  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({
      status: false,
      message: "Failed to resend OTP",
      error: err.message,
    });
  }
};

// Assumes you have an errorHandler() middleware/util to forward errors, or just res.status(...)
export const getProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId).select("-password -otp -otpExpires");
    if (!user) return res.status(404).json({ status: false, message: "User not found" });
    res.json({ status: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Failed to fetch profile", error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { firstname, lastname, phone, avatar } = req.body;

    const updated = await User.findByIdAndUpdate(
      userId,
      { firstname, lastname, phone, avatar },
      { new: true, runValidators: true }
    ).select("-password -otp -otpExpires");

    if (!updated) return res.status(404).json({ status: false, message: "User not found" });
    res.json({ status: true, message: "Profile updated", user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Update failed", error: err.message });
  }
};

// Add address
export const addAddress = async (req, res) => {
  try {
    const userId = req.userId;
    const { addressLine, city, state, isDefault = false } = req.body;

    if (!addressLine || !city || !state) {
      return res.status(400).json({
        status: false,
        message: "Address line, city, and state are required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Reset previous defaults if this new one is default
    if (isDefault) {
      user.addresses.forEach((a) => (a.isDefault = false));
    }

    const newAddress = {
      label: "Home",
      addressLine,
      city,
      state,
      isDefault,
    };

    user.addresses.push(newAddress);
    await user.save();

    res.status(200).json({
      status: true,
      message: "Address added successfully",
      addresses: user.addresses,
    });
  } catch (err) {
    console.error("Add Address Error:", err);
    res.status(500).json({
      status: false,
      message: "Failed to add address",
      error: err.message,
    });
  }
};

export const getUserAddresses = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .select("addresses"); // 👈 only addresses

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      count: user.addresses.length,
      addresses: user.addresses,
    });
  } catch (error) {
    console.error("Get addresses error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch addresses",
    });
  }
};

// Update address (using query)
export const updateAddress = async (req, res) => {
  try {
    const userId = req.userId;
    const { addressId } = req.query; // 👈 changed from params to query
    const { state, city, addressLine, isDefault } = req.body;

    if (!addressId)
      return res.status(400).json({ status: false, message: "addressId query is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    const addr = user.addresses.id(addressId);
    if (!addr) return res.status(404).json({ status: false, message: "Address not found" });

    // Handle default address
    if (typeof isDefault === "boolean" && isDefault) {
      user.addresses.forEach(a => (a.isDefault = false));
      addr.isDefault = true;
    }

    // Update fields
    if (addressLine !== undefined) addr.addressLine = addressLine;
    if (state !== undefined) addr.state = state;
    if (city !== undefined) addr.city = city;

    await user.save();

    res.json({
      status: true,
      message: "Address updated successfully",
      address: addr,
      addresses: user.addresses,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: false,
      message: "Failed to update address",
      error: err.message,
    });
  }
};

// Delete address (using query)
export const deleteAddress = async (req, res) => {
  try {
    const userId = req.userId;
    const { addressId } = req.query;

    if (!addressId)
      return res.status(400).json({ status: false, message: "addressId query is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    const addrExists = user.addresses.some(addr => addr._id.toString() === addressId);
    if (!addrExists)
      return res.status(404).json({ status: false, message: "Address not found" });

    // ✅ Remove address by filtering
    user.addresses = user.addresses.filter(addr => addr._id.toString() !== addressId);

    await user.save();

    res.json({
      status: true,
      message: "Address deleted successfully",
      addresses: user.addresses,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: false,
      message: "Failed to delete address",
      error: err.message,
    });
  }
};

// Logout user
export const logoutUser = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === "production";

    // Clear JWT cookie with same settings as when it was set
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
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


export const deleteAccount = async (req, res) => {
  try {
    const userId = req.userId; // set by auth middleware

    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    await User.findByIdAndDelete(userId);

    res.status(200).json({
      status: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: false,
      message: "Failed to delete account",
      error: err.message,
    });
  }
};
