import nodemailer from "nodemailer";
import { wrapLayout } from "../../services/emailTemplate.service.js";

export const sendUserSuspensionEmail = async (user, reason) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.EMAIL_PASS,
    },
  });

  const html = wrapLayout(
    'Account Suspension',
    `
    <p class="p">Dear ${user.firstname || 'Member'},</p>
    <p class="p">We are writing to inform you that your MelaChow account has been temporarily <strong>suspended</strong> following a violation of our community guidelines or service terms.</p>
    <p class="p"><strong>Reason:</strong> ${reason || 'System policy violation'}</p>
    <p class="p">While suspended, you will be unable to place orders or interact with the platform. We take these matters seriously to maintain a safe environment for all our members.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="mailto:support@melachow.com" class="button" style="background-color: #EF4444;">Contact Support Team</a>
    </div>
    <p class="p" style="font-size: 14px; color: #6B7280;">If you believe this was an error, please reach out to our appeals team using the button above.</p>
    `,
    'Safety Alert'
  );

  await transporter.sendMail({
    from: `"MelaChow" <${process.env.ADMIN_EMAIL}>`,
    to: user.email,
    subject: "Account Suspension Notice",
    html,
  });
};

