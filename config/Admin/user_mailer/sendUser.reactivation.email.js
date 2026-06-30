import nodemailer from "nodemailer";

export const sendUserReactivationEmail = async (user) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.EMAIL_PASS,
    },
  });

  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px 0; text-align: center;">
      <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.8);">
        <div style="background-color: #ff6600; padding: 20px; text-align: center;">
            <h1 style="color: #fff; margin: 0;">Account Reactivated</h1>
            <p style="color: #ffe6d1; margin: 5px 0;">Manage your store ðŸ´</p>
        </div>
        <div style="text-align: left; color: #333; font-size: 16px; line-height: 1.6;">
          <p>Dear <b>${user.firstname || "User"}</b>,</p>
          <p>Good news! Your <b>MelaChow</b> account has been <b>reactivated</b> and is now active again.</p>
          <p>We're glad to have you back! Please make sure all your future activities align with our community and user policy guidelines to ensure a safe experience for everyone.</p>
          <p>If you have any questions or need assistance, feel free to reach out to our support team anytime.</p>
          <br/>
          <p style="margin: 0;">â€” <b>The MelaChow Team</b></p>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <div style="font-size: 13px; color: #777;">
          <p>Need help? Contact us at <a href="mailto:support@melachow.com" style="color: #2E86C1;">support@melachow.com</a> or <a href="mailto:help@melachow.com" style="color: #2E86C1;">help@melachow.com</a></p>
          <p>Â© ${new Date().getFullYear()} MelaChow. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"MelaChow" <${process.env.ADMIN_EMAIL}>`,
    to: user.email,
    subject: "Account Reactivated",
    html,
  });
};

