import { sendUserBanEmail } from "../../../config/Admin/user_mailer/sendUser.ban.email.js";
import { sendUserReactivationEmail } from "../../../config/Admin/user_mailer/sendUser.reactivation.email.js";
import { sendUserSuspensionEmail } from "../../../config/Admin/user_mailer/sendUser.suspension.email.js";
import User from "../../../model/user.model.js";

/**
 * Get all users with optional filters
 * Example: /api/admin/users/all?verified=true&suspended=false
 */
export const getAllUsers = async (req, res) => {
  try {
    const { verified, suspended, banned, search } = req.query;
    const filters = {};

    if (verified !== undefined) filters.isVerified = verified === "true";
    if (suspended !== undefined) filters.suspended = suspended === "true";
    if (banned !== undefined) filters.banned = banned === "true";
    if (search)
      filters.$or = [
        { firstname: new RegExp(search, "i") },
        { lastname: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
      ];

    const users = await User.find(filters)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get single user details
 */
export const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId)
      return res.status(400).json({ success: false, message: "userId is required" });

    const user = await User.findById(userId).lean();
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Suspend a user
 */
export const suspendUser = async (req, res) => {
  try {
    const { userId, reason } = req.query;
    const user = await User.findById(userId);

    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    if (user.suspended)
      return res.status(400).json({ success: false, message: "User already suspended" });

    user.suspended = true;
    user.suspensionReason = reason || "Account suspended due to policy violation.";
    await user.save();

    // Send suspension email
    await sendUserSuspensionEmail(user, reason);

    res.status(200).json({
      success: true,
      message: "User suspended successfully and notified via email",
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Ban a user permanently
 */
export const banUser = async (req, res) => {
  try {
    const { userId, reason } = req.query;
    const user = await User.findById(userId);

    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    if (user.banned)
      return res.status(400).json({ success: false, message: "User already banned" });

    user.banned = true;
    user.banReason = reason || "You have been permanently banned for serious violations.";
    await user.save();

    // Send ban email
    await sendUserBanEmail(user, reason);

    res.status(200).json({
      success: true,
      message: "User banned successfully and notified via email",
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Reactivate suspended or banned user
 */
export const reactivateUser = async (req, res) => {
  try {
    const { userId } = req.query;
    const user = await User.findById(userId);

    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    if (!user.suspended && !user.banned)
      return res.status(400).json({ success: false, message: "User is already active" });

    user.suspended = false;
    user.banned = false;
    user.suspensionReason = null;
    user.banReason = null;
    await user.save();

    // Send reactivation email
    await sendUserReactivationEmail(user);

    res.status(200).json({
      success: true,
      message: "User reactivated successfully and notified via email",
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get user statistics for admin dashboard
 */
export const getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const suspendedUsers = await User.countDocuments({ suspended: true });
    const bannedUsers = await User.countDocuments({ banned: true });

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        verifiedUsers,
        suspendedUsers,
        bannedUsers,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
