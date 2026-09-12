// controllers/admin.controller.js
import User from "../../model/user.model.js";

import jwt from "jsonwebtoken";
import { sendAdminEmail } from "../../config/Admin/admin.mailer.js";
import Admin from "../../model/Admin/admin.model.js";
import Wallet from "../../model/wallet/wallet.mode.js";
import { sendAuthCookies } from '../../utils/sendTokenCookie.js';

import { generateAccessToken, generateRefreshToken } from "../../utils/generateTokens.js";
import ActivityLog from "../../model/ActivityLog.js";
import { usePostgresAdminWrites } from "../../services/postgres/compat.js";
import { adminAccountRepository } from "../../services/postgres/adminAccount.repository.js";

// ==========================
// GET CURRENT ADMIN PROFILE
// ==========================
export const getMe = async (req, res) => {
  try {
    if(usePostgresAdminWrites()){const admin=await adminAccountRepository.get(req.admin._id);if(!admin)return res.status(404).json({success:false,message:"Admin not found"});return res.status(200).json({success:true,admin});}
    const admin = await Admin.findById(req.admin._id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    res.status(200).json({
      success: true,
      admin: admin.getPublicProfile(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch profile", error: err.message });
  }
};


export const registerAdmin = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!role || !["admin", "super-admin", "finance-admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "A valid role is required. Allowed roles: admin, super-admin, finance-admin.",
      });
    }
    if(usePostgresAdminWrites()){const result=await adminAccountRepository.register({name,email,password,role});if(result.error)return res.status(400).json({success:false,message:"Email already exists"});return res.status(201).json({success:true,message:"Admin registered successfully",admin:{...result.admin,wallet:result.wallet}});}

    // Check if admin already exists
    const existing = await Admin.findOne({ email });
    if (existing)
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });

    // Create the admin first
    const admin = await Admin.create({ name, email, password, role });

    let wallet = null;
    if (admin.role === "super-admin") {
      // Create a wallet for the super-admin immediately
      wallet = await Wallet.create({
        ownerId: admin._id,
        ownerModel: "Admin",
        balance: 0,
        transactions: [],
      });

      // Link wallet to admin
      admin.wallet = wallet._id;
      await admin.save();
    }
    // Log registration
    await ActivityLog.create({
      adminId: admin._id,
      action: "LOGIN", // Registry counts as initial login
      targetType: "Admin",
      targetId: admin._id,
      details: `New admin registered with role: ${role}`,
    });

    // Response
    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      admin: { ...admin.getPublicProfile(), wallet },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: err.message,
    });
  }
};

// =============================
// LOGIN ADMIN (EMAIL + PASSWORD)
// =============================
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if(usePostgresAdminWrites()){const raw=await adminAccountRepository.findByEmail(email,{raw:true});if(!raw)return res.status(404).json({success:false,message:"Admin not found"});if(!await adminAccountRepository.comparePassword(raw,password))return res.status(401).json({success:false,message:"Invalid credentials"});await adminAccountRepository.resetLoginAttempts(raw.id);const role=raw.role==="super_admin"?"super-admin":raw.role==="finance_admin"?"finance-admin":raw.role,accessToken=generateAccessToken({id:raw.id,role}),refreshToken=generateRefreshToken({id:raw.id,role});sendAuthCookies(res,accessToken,refreshToken,"admin");await adminAccountRepository.recordActivity({actorId:raw.id,action:"LOGIN",targetModel:"System",details:`${raw.name} logged into the system`,ipAddress:req.ip,userAgent:req.headers["user-agent"]});return res.status(200).json({success:true,message:"Login successful",accessToken,admin:await adminAccountRepository.get(raw.id)});}
    const admin = await Admin.findOne({ email }).select("+password");
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const accessToken = generateAccessToken({ id: admin._id, role: admin.role });
    const refreshToken = generateRefreshToken({ id: admin._id, role: admin.role });

    sendAuthCookies(res, accessToken, refreshToken, 'admin');

    // Log login
    await ActivityLog.create({
      adminId: admin._id,
      action: "LOGIN",
      targetType: "System",
      details: `${admin.name} logged into the system`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken, // Short-lived token
      admin: admin.getPublicProfile()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Login failed", error: err.message });
  }
};

// =============================
// FORGOT PASSWORD (SEND OTP)
// =============================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if(usePostgresAdminWrites()){const admin=await adminAccountRepository.findByEmail(email,{raw:true});if(!admin)return res.status(404).json({success:false,message:"Admin not found"});const otp=Math.floor(100000+Math.random()*900000).toString();await adminAccountRepository.setResetOtp(admin.id,otp,new Date(Date.now()+10*60*1000));await sendAdminEmail({...admin,role:admin.role==="super_admin"?"super-admin":admin.role},otp,"reset");return res.status(200).json({success:true,message:"OTP sent to your email"});}
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.otp = otp;
    admin.otpExpires = Date.now() + 10 * 60 * 1000;
    await admin.save();

    await sendAdminEmail(admin, otp, "reset");

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to send OTP", error: err.message });
  }
};

// =============================
// VERIFY OTP AND RESET PASSWORD
// =============================
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if(usePostgresAdminWrites()){const admin=await adminAccountRepository.findByEmail(email,{raw:true});if(!admin)return res.status(404).json({success:false,message:"Admin not found"});if(String(admin.otp||"").trim()!==String(otp).trim()||!admin.otpExpires||new Date()>admin.otpExpires)return res.status(400).json({success:false,message:"OTP invalid or expired"});const token=`legacy-otp-${Date.now()}`;await adminAccountRepository.setResetToken(admin.id,token,new Date(Date.now()+60000));await adminAccountRepository.resetPassword(email,token,newPassword);return res.status(200).json({success:true,message:"Password reset successfully"});}
    const admin = await Admin.findOne({ email }).select("+password");
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    if (String(admin.otp).trim() !== String(otp).trim() || Date.now() > admin.otpExpires)
      return res.status(400).json({ success: false, message: "OTP invalid or expired" });

    admin.password = newPassword;
    admin.otp = null;
    admin.otpExpires = null;
    await admin.save();

    res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Password reset failed", error: err.message });
  }
};

// =============================
// GET ALL ADMINS (SUPER ADMIN USE)
// =============================
export const getAllAdmins = async (req, res) => {
  try {
    if(usePostgresAdminWrites()){const admins=await adminAccountRepository.list();return res.status(200).json({success:true,count:admins.length,admins});}
    const admins = await Admin.find().select("-password");
    res.status(200).json({ success: true, count: admins.length, admins });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch admins", error: err.message });
  }
};

// =============================
// DELETE ADMIN (SUPER ADMIN USE)
// =============================
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if(usePostgresAdminWrites()){const deleted=await adminAccountRepository.remove(id,req.admin?._id);if(!deleted)return res.status(404).json({success:false,message:"Admin not found"});return res.status(200).json({success:true,message:"Admin deleted successfully"});}
    const adminToDelete = await Admin.findById(id);
    await Admin.findByIdAndDelete(id);

    // Log deletion if performer is super-admin
    if (req.admin) {
      await ActivityLog.create({
        adminId: req.admin._id,
        action: "DELETE_ADMIN",
        targetType: "Admin",
        targetId: id,
        details: `Deleted admin account: ${adminToDelete?.email || id}`,
      });
    }

    res.status(200).json({ success: true, message: "Admin deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Delete failed", error: err.message });
  }
};

// Admin-only: Get all users
export const getAllUsers = async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
};

// Admin Logout
export const logoutAdmin = async (req, res) => {
  try {
    res.clearCookie("adminToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    // Log logout
    if (req.admin) {
      if(usePostgresAdminWrites()){await adminAccountRepository.recordActivity({actorId:req.admin._id,action:"LOGOUT",targetModel:"System",details:`${req.admin.name} logged out`});return res.status(200).json({success:true,message:"Logged out successfully"});}
      await ActivityLog.create({
        adminId: req.admin._id,
        action: "LOGOUT",
        targetType: "System",
        details: `${req.admin.name} logged out`,
      });
    }

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Logout failed", error: err.message });
  }
};

// =============================
// GET RECENT ACTIVITIES
// =============================
export const getRecentActivities = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    if(usePostgresAdminWrites()){const result=await adminAccountRepository.activities({limit,page});return res.status(200).json({success:true,count:result.activities.length,total:result.total,activities:result.activities});}
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const activities = await ActivityLog.find()
      .populate("adminId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ActivityLog.countDocuments();

    res.status(200).json({
      success: true,
      count: activities.length,
      total,
      activities,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch activities", error: err.message });
  }
};

