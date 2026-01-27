// config/Admin/adminSuspendVendor.mailer.js
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

export const sendVendorSuspensionEmail = async (vendor, reason) => {
  const subject = "Your Vendor Account Has Been Suspended";
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; background-color: #f4f7fb; padding: 40px 0;">
      <div style="max-width: 600px; background: #ffffff; margin: auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background-color: #ff6600; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">GrubDash Vendor</h1>
          <p style="color: #ffe6d1; margin: 5px 0;">Manage your store 🍴</p>
        </div>

        <!-- Body -->
        <div style="padding: 30px; color: #333333;">
          <h2 style="color: #ff6600; text-align: center; margin-bottom: 20px;">Account Suspended</h2>
          <p style="font-size: 16px;">Dear <strong>${vendor.name}</strong>,</p>
          <p style="font-size: 15px; line-height: 1.6;">
            We regret to inform you that your vendor account has been temporarily <strong>suspended</strong>.
          </p>
          <p style="font-size: 15px; line-height: 1.6;">
            <strong>Reason:</strong> ${reason || "No reason specified."}
          </p>
          <p style="font-size: 15px; line-height: 1.6;">
            During this suspension, you will not be able to access your dashboard or perform vendor activities.
          </p>
          <p style="font-size: 15px; line-height: 1.6;">
            If you believe this action was taken in error, please contact our support team for assistance.
          </p>

          <!-- Support Button -->
          <div style="text-align: center; margin-top: 30px;">
            <a href="mailto:support@grubdash.com" 
              style="background-color: #ff6600; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Contact Support
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 13px; color: #666;">
          <p>© ${new Date().getFullYear()} GrubDash. All rights reserved.</p>
          <p>123 Food Street, Lagos, Nigeria</p>
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
