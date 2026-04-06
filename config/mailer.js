import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send transactional email via Resend API.
 * Uses HTTPS (port 443) â€” works on Render free tier.
 * Drop-in replacement for nodemailer sendMail.
 *
 * @param {object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML email body
 */
export const sendMail = async ({ to, subject, html }) => {
    const { data, error } = await resend.emails.send({
        from: 'MelaChow <noreply@mail.melachow.ng>',
        to,
        subject,
        html,
    });

    if (error) {
        throw new Error(`Email send failed: ${error.message}`);
    }

    return data;
};

