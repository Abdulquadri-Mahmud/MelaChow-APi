// config/Admin/adminApprovedVendor.mailer.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendVendorApprovalEmail = async (vendor) => {
  const subject = "Your Vendor Account Has Been Approved";

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; background-color: #f4f7fb; padding: 40px 0;">
      <div style="max-width: 600px; background: #ffffff; margin: auto; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08);">

        <!-- Header -->
        <div style="background-color: #ff6600; padding: 20px; text-align: center;">
            <h1 style="color: #fff; margin: 0;">MelaChow Vendor</h1>
            <p style="color: #ffe6d1; margin: 5px 0;">Manage your store ðŸ´</p>
        </div>

        <!-- Body -->
        <div style="padding: 30px; color: #333;">
          <h2 style="color: #FF6600; text-align: center;">ðŸŽ‰ Congratulations, ${vendor.name}!</h2>
          <p style="font-size: 15px; line-height: 1.6; text-align: center;">
            Your <strong>vendor account</strong> on 
            <span style="color: #FF6600; font-weight: 600;">MelaChow</span> has been successfully <strong>approved</strong> by our admin team.
          </p>
          <p style="font-size: 15px; line-height: 1.6; text-align: center; margin-top: 10px;">
            You can now log in, add products, and start selling amazing items on our platform.
          </p>

          <div style="text-align: center; margin: 25px 0;">
            <a href="https://auroragems.com/vendor/login"
               style="display: inline-block; background-color: #FF6600; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">
               Proceed to login
            </a>
          </div>

          <p style="font-size: 14px; color: #FF6600; text-align: center;">
            If you have any questions, feel free to reply to this email.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafc; padding: 20px; text-align: center; font-size: 13px; color: #888;">
          <p>Â© ${new Date().getFullYear()} MelaChow. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"MelaChow" <${process.env.EMAIL_USER}>`,
    to: vendor.email,
    subject,
    html,
  });
};

