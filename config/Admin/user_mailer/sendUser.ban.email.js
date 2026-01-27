import nodemailer from "nodemailer";

export const sendUserBanEmail = async (user, reason) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.EMAIL_PASS,
    },
  });

  const html = `
  <div style="font-family: 'Segoe UI', sans-serif; background-color: #f4f7fb; padding: 40px 0;">
    <div style="max-width: 600px; background: #ffffff; margin: auto; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08);">

      <!-- Header -->
      <div style="background-color: #ff6600; padding: 20px; text-align: center;">
        <h1 style="color: #fff; margin: 0;">GrubDash User</h1>
        <p style="color: #ffd6d6; margin: 5px 0;">Important Account Notice ⚠️</p>
      </div>

      <!-- Body -->
      <div style="padding: 30px; color: #333;">
        <h2 style="color: #ff6600; text-align: center;">🚫 Account Banned</h2>
        <p style="font-size: 15px; line-height: 1.6; text-align: center;">
          Dear <strong>${user.firstname || "User"}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.6; text-align: center;">
          We regret to inform you that your account on 
          <strong style="color: #ff6600;">GrubDash</strong> has been 
          <strong>permanently banned</strong> following a serious violation of our terms of service.
        </p>

        <div style="background-color: #fbe9e9; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #a93226;">
            <strong>Reason:</strong> ${reason || "Severe violation of our terms or fraudulent activity detected."}
          </p>
        </div>

        <p style="font-size: 15px; line-height: 1.6; text-align: center;">
          This action has been reviewed and approved by our moderation team, and it is <strong>final and non-reversible</strong>.
        </p>

        <p style="font-size: 15px; line-height: 1.6; text-align: center; margin-top: 15px;">
          If you believe this was an error, you may contact our support team for further clarification.  
        </p>

        <div style="text-align: center; margin: 25px 0;">
          <a href="https://GrubDash.com/support"
            style="display: inline-block; background-color: #ff6600; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Contact Support
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafc; padding: 20px; text-align: center; font-size: 13px; color: #888;">
        <p>© ${new Date().getFullYear()} GrubDash. All rights reserved.</p>
      </div>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from: `"GrubDash" <${process.env.ADMIN_EMAIL}>`,
    to: user.email,
    subject: "Account Ban Notice",
    html,
  });
};
