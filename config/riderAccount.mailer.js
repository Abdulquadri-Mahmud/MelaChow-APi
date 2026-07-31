import { sendMail } from "./mailer.js";
import { wrapLayout } from "../services/emailTemplate.service.js";

export const sendRiderApprovalEmail = async (rider) => {
    const subject = "Your MelaChow Rider Account Has Been Approved";
    const html = wrapLayout(
        "Rider Account Approved",
        `<p class="p">Hello ${rider.name || "Rider"},</p>
         <p class="p">Your MelaChow rider registration has been verified and approved. You can now sign in to the rider app and start receiving deliveries.</p>
         <div style="text-align:center;margin:32px 0;"><a href="https://melachow.com/rider/login" class="button">Open Rider Portal</a></div>`,
        "You are ready to deliver"
    );
    return sendMail({ to: rider.email, subject, html });
};

export const sendRiderSuspensionEmail = async (rider, reason = "") => {
    const subject = "Your MelaChow Rider Account Has Been Suspended";
    const html = wrapLayout(
        "Rider Account Suspended",
        `<p class="p">Hello ${rider.name || "Rider"},</p>
         <p class="p">Your rider account has been suspended by the MelaChow operations team. You cannot come online or receive new delivery assignments until your account is reactivated.</p>
         ${reason ? `<div style="background:#FFFBEB;border-left:4px solid #F59E0B;padding:16px;margin:24px 0;"><p class="p" style="margin:0;font-weight:700;">Reason</p><p class="p" style="margin:4px 0 0;">${reason}</p></div>` : ""}
         <p class="p">If you believe this is an error, please contact support.</p>`,
        "Action required"
    );
    return sendMail({ to: rider.email, subject, html });
};