// config/Vendor/vendorAccountCreated.mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail", // or any preferred service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendVendorAccountCreatedEmail = async (vendor) => {
  const subject = "Welcome to MelaChow, Your Vendor Account Has Been Created!";

  const html = `
    <div style="font-family: 'Inter', 'Segoe UI', sans-serif; background-color: #f8fafc; padding: 40px 0;">
      <div style="max-width: 600px; background: #ffffff; margin: auto; border-radius: 12px; overflow: hidden; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">

        <!-- Header -->
        <div style="background-color: #FF6600; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px;">MelaChow Vendor Portal</h1>
          <p style="color: #ffd7b5; margin: 6px 0 0;">Fueling the future of local food delivery ðŸ²</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px; color: #333;">
          <h2 style="color: #FF6600; text-align: center;">Welcome aboard, ${vendor.name}! ðŸ‘‹</h2>

          <p style="font-size: 15px; line-height: 1.7; text-align: center; margin: 16px 0;">
            Weâ€™re excited to let you know that your <strong>vendor account</strong> on 
            <span style="color: #FF6600; font-weight: 600;">MelaChow</span> has been <strong>created successfully</strong>.
          </p>

          <p style="font-size: 15px; line-height: 1.7; text-align: center; margin: 10px 0;">
            Our admin team is currently reviewing your details. Once your account is verified, 
            youâ€™ll receive another email confirming that your store is live and ready for login.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://melachow.com"
               style="display: inline-block; background-color: #FF6600; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
               Visit MelaChow
            </a>
          </div>

          <p style="font-size: 14px; color: #555; text-align: center;">
            Youâ€™ll get a follow-up email as soon as your vendor account is verified and activated.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafc; padding: 20px; text-align: center; font-size: 13px; color: #888;">
          <p>Need help? Contact our vendor support at <a href="mailto:support@melachow.com" style="color: #FF6600; text-decoration: none;">support@melachow.com</a></p>
          <p style="margin-top: 6px;">Â© ${new Date().getFullYear()} MelaChow. All rights reserved.</p>
        </div>

      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"MelaChow Vendor Team" <${process.env.EMAIL_USER}>`,
    to: vendor.email,
    subject,
    html,
  });
};

