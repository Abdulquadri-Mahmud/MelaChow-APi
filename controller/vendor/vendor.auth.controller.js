import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import vendorModel from "../../model/vendor/vendor.model.js";
import { sendVendorEmail } from "../../config/vendors.mailer.js";
import { sendTokenCookie } from "../../utils/sendTokenCookie.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/generateTokens.js";

// ============================
// VENDOR LOGIN (EMAIL + OTP)
// ============================
export const vendorLogin = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if vendor exists
    const vendor = await vendorModel.findOne({ email });
    if (!vendor)
      return res.status(404).json({
        success: false,
        message: "Vendor not found. Please check your email and try again.",
      });

    // Check if vendor is verified by admin
    if (!vendor.verified) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is currently under review and has not yet been verified. Verification is typically completed within 24 hours by the GrubDash Admin Team. You will be notified though your email once your account is approved.",
      });
    }

    // Password check removed for OTP-only login

    // Generate OTP for verified vendors
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    vendor.otp = otp;
    vendor.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await vendor.save();

    await sendVendorEmail(vendor, otp, "login");

    res.status(200).json({
      success: true,
      message:
        "A One-Time Password (OTP) has been sent to your registered email. Please verify to complete your login.",
      vendorId: vendor._id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "An error occurred while processing your login request. Please try again later.",
      error: error.message,
    });
  }
};


// ============================
// VERIFY OTP
// ============================
export const verifyVendorOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Validate inputs
    if (!email || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });
    }

    const vendor = await vendorModel.findOne({ email });
    if (!vendor)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });

    if (vendor.otp !== otp || Date.now() > vendor.otpExpires)
      return res
        .status(400)
        .json({ success: false, message: "OTP is invalid or expired" });

    // Clear OTP fields after successful verification
    vendor.otp = null;
    vendor.otpExpires = null;
    await vendor.save();

    // Generate Tokens
    const accessToken = generateAccessToken({ id: vendor._id, role: "vendor" });
    const refreshToken = generateRefreshToken({ id: vendor._id, role: "vendor" });

    sendTokenCookie(res, refreshToken, "vendorToken");

    res.status(200).json({
      success: true,
      message: "Vendor logged in successfully",
      accessToken, // Short-lived token for Request Authorization
      vendor: vendor.getPublicProfile(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
      error: error.message,
    });
  }
};

// ============================
// FORGOT PASSWORD
// ============================
export const vendorForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const vendor = await vendorModel.findOne({ email });
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    vendor.otp = otp;
    vendor.otpExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    await vendor.save();

    await sendVendorEmail(vendor, otp, "reset");

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      vendorId: vendor._id,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to send OTP", error: error.message });
  }
};

// ============================
// RESET PASSWORD
// ============================
export const vendorResetPassword = async (req, res) => {
  try {
    const { vendorId, otp, newPassword } = req.body;

    const vendor = await vendorModel.findById(vendorId).select("+password");
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    if (vendor.otp !== otp || Date.now() > vendor.otpExpires)
      return res.status(400).json({ success: false, message: "OTP invalid or expired" });

    vendor.password = newPassword;
    vendor.otp = null;
    vendor.otpExpires = null;
    await vendor.save();

    res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Reset password failed", error: error.message });
  }
};

// ============================
// RESEND OTP
// ============================
export const vendorResendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const vendor = await vendorModel.findOne({ email });
    if (!vendor)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    vendor.otp = otp;
    vendor.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await vendor.save();

    // Send OTP email
    await sendVendorEmail(vendor, otp, "resend");

    res
      .status(200)
      .json({ success: true, message: "OTP resent successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
      error: error.message,
    });
  }
};


export const vendorLogout = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === "production";

    // Clear JWT cookie with same settings as when it was set
    res.clearCookie("vendorToken", {
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