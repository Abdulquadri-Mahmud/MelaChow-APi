// config/Admin/adminRejectVendor.mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { 
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    },
});

export const sendVendorRejectionEmail = async (vendor, reason) => {
  const subject = "Your Vendor Application Was Rejected";
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; background-color: #f4f7fb; padding: 40px 0;">
      <div style="max-width: 600px; background: #ffffff; margin: auto; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #ff4d4d; padding: 20px; text-align: center;">
          <h1 style="color: #fff;">GrubDash Vendor</h1>
        </div>
        <div style="padding: 30px; color: #333;">
          <h2 style="color: #ff4d4d; text-align: center;">Application Rejected</h2>
          <p>Dear ${vendor.name},</p>
          <p>We regret to inform you that your vendor registration was rejected.</p>
          <p><strong>Reason:</strong> ${reason || "Not specified"}</p>
          <p>You may contact support for further details.</p>
        </div>
      </div>
    </div>
  `;
  await transporter.sendMail({
    from: `"GrubDash" <${process.env.EMAIL_USER}>`,
    to: vendor.email,
    subject,
    html,
  });
};
