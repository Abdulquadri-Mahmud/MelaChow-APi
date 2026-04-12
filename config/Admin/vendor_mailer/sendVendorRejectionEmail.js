import { sendMail } from '../../../config/mailer.js';
import { wrapLayout } from '../../../services/emailTemplate.service.js';

export const sendVendorRejectionEmail = async (vendor, reason) => {
  const subject = "Your Vendor Application Was Rejected";
  const html = wrapLayout(
    'Application Rejected',
    `
    <p class="p">Hello ${vendor.name || 'Vendor'},</p>
    <p class="p">Thank you for your interest in joining the MelaChow network. After carefully reviewing your registration details, we are unable to approve your application at this time.</p>
    <div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; margin: 24px 0;">
      <p class="p" style="margin: 0; font-weight: 700; color: #991B1B;">Reason for Rejection:</p>
      <p class="p" style="margin: 4px 0 0; color: #B91C1C; font-size: 14px;">${reason || "Your application did not meet our current verification requirements."}</p>
    </div>
    <p class="p">You are welcome to re-apply once the issues above have been addressed. If you believe this was a mistake, please reach out to our verification team.</p>
    `,
    'Application Review'
  );
  
  await sendMail({ to: vendor.email, subject, html });
};
