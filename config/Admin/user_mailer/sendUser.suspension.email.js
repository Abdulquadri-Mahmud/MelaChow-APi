import nodemailer from "nodemailer";

export const sendUserSuspensionEmail = async (user, reason) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.EMAIL_PASS,
    },
  });

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; background-color: #f4f7fb; padding: 40px 0;">
      <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.8);">
        
        <!-- Header -->
        <div style="background-color: #ff6600; color: #ffffff; padding: 20px 30px;"">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">MelaChow</h1>
          <p style="color: #ffe6d1; margin: 5px 0;">Manage your store ðŸ´</p>
        </div>

        <!-- Body -->
        <div style="padding: 30px; color: #333333;">
          <h2 style="color: #ff6600; text-align: center; margin-bottom: 20px;">Account Suspended</h2>
          <p style="font-size: 16px;">Dear <strong>${user.firstname || "User"}</strong>,</p>
          <p style="font-size: 15px; line-height: 1.6;">
            We regret to inform you that your MelaChow account has been temporarily 
            <strong>suspended</strong> due to a violation of our user policies.
          </p>
          <p style="font-size: 15px; line-height: 1.6;">
            <strong>Reason:</strong> ${reason || "Violation of our terms or community guidelines."}
          </p>
          <p style="font-size: 15px; line-height: 1.6;">
            During this suspension period, you will not be able to place orders or access your account features.
          </p>
          <p style="font-size: 15px; line-height: 1.6;">
            If you believe this was done in error, please contact our support team for clarification.
          </p>

          <!-- Support Button -->
          <div style="text-align: center; margin-top: 30px;">
            <a href="mailto:support@melachow.com" 
              style="background-color: #ff6600; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Contact Support
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 13px; color: #666;">
          <p>Â© ${new Date().getFullYear()} MelaChow. All rights reserved.</p>
          <p>123 Food Street, Lagos, Nigeria</p>
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"MelaChow" <${process.env.ADMIN_EMAIL}>`,
    to: user.email,
    subject: "Account Suspension Notice",
    html,
  });
};

