// import axios from 'axios'; // Removed Termii dependency
import { safeRedisSet, safeRedisGet } from '../config/redis.js';
import { sendMail } from '../config/mailer.js';
import logger from '../config/logger.js';
import { wrapLayout } from './emailTemplate.service.js';
import {
    deleteDeliveryOtpSession,
    getDeliveryOtpSession,
    storeDeliveryOtpSession,
} from './postgres/riderOtp.repository.js';

// Delivery OTPs use Redis as a fast cache and PostgreSQL as the durable fallback.
const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_REDIS_PREFIX = 'delivery_otp:';

/**
 * Store OTP payload with Redis primary and PostgreSQL fallback.
 * Called by sendDeliveryOTP. Guarantees OTP is persisted even
 * when Redis free tier is unavailable.
 */
const storeOtpPayload = async (redisKey, payload) => {
    const serialized = JSON.stringify(payload);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await storeDeliveryOtpSession(redisKey, payload, expiresAt);
    await safeRedisSet(redisKey, serialized, { EX: OTP_TTL_SECONDS });
};

const retrieveOtpPayload = async (redisKey) => {
    const cached = await safeRedisGet(redisKey);
    if (cached) return cached;

    const fallback = await getDeliveryOtpSession(redisKey);
    if (!fallback) return null;
    const serialized = JSON.stringify(fallback);
    const remainingSeconds = Math.max(
        1,
        Math.ceil((new Date(fallback.expiresAt || 0).getTime() - Date.now()) / 1000)
    );
    await safeRedisSet(redisKey, serialized, { EX: remainingSeconds });
    return serialized;
};
/**
 * Delete OTP payload from both stores after successful verification.
 */
const deleteOtpPayload = async (redisKey) => {
    // Redis delete Ã¢â‚¬â€ safeRedisSet with immediate expiry is not a true delete,
    // so we overwrite with a 1-second TTL to flush it as fast as possible
    await safeRedisSet(redisKey, JSON.stringify({ expired: true }), { EX: 1 });
    await deleteDeliveryOtpSession(redisKey);
};

export const sendDeliveryOTP = async (
    orderId,
    customerPhone,
    customerUserId,
    { forceResend = false, customerEmail, readableOrderId = orderId } = {}
) => {
    const redisKey = `${OTP_REDIS_PREFIX}${orderId}`;
    const existing = await retrieveOtpPayload(redisKey);
    if (existing) {
        const existingData = JSON.parse(existing);
        const issuedAt = new Date(existingData.issuedAt || 0).getTime();
        const retryAfterSeconds = Math.max(0, OTP_RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - issuedAt) / 1000));
        if (!forceResend) {
            return { success: true, method: existingData.method, reused: true, retryAfterSeconds, expiresAt: existingData.expiresAt || null };
        }
        if (retryAfterSeconds > 0) {
            const error = new Error(`Please wait ${retryAfterSeconds} seconds before sending a new delivery code.`);
            error.statusCode = 429;
            error.code = "OTP_RESEND_COOLDOWN";
            error.retryAfterSeconds = retryAfterSeconds;
            throw error;
        }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Development bypass Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    if (process.env.BYPASS_OTP === 'true') {
        await storeOtpPayload(redisKey, {
            method: 'dev',
            pinId: null,
            otp: '123456',
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
        });
        logger.info({ orderId }, 'Dev mode: OTP bypass active Ã¢â‚¬â€ use 123456');
        return { success: true, method: 'dev' };
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Production: Email via Resend Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    try {
        if (!customerEmail) throw new Error('Customer email not found');

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP before sending email Ã¢â‚¬â€ if email fails, OTP was never exposed
        await storeOtpPayload(redisKey, {
            method: 'email',
            pinId: null,
            otp,
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
        });

        await sendMail({
            to: customerEmail,
            subject: `Delivery Confirmation Code for Order ${readableOrderId}: ${otp}`,
            html: wrapLayout(
                'Verification Required',
                `
                <p class="p">Your rider has arrived at your location. Please provide this secure code to confirm you've received your order.</p>
                <div style="background: #F3F4F6; border-radius: 20px; padding: 40px; text-align: center; margin: 32px 0; border: 2px dashed #E5E7EB;">
                    <span style="font-size: 48px; font-weight: 900; letter-spacing: 12px; color: #111827; font-family: 'Courier New', Courier, monospace;">
                        ${otp}
                    </span>
                </div>
                <p class="p" style="font-size: 14px; color: #6B7280; text-align: center;">
                    This code expires in 10 minutes. Only share it with your rider once you have the items.
                </p>
                `,
                'Security Check'
            ),
        });

        logger.info({ orderId, email: customerEmail, readableOrderId }, 'Delivery OTP sent via Resend email');
        return { success: true, method: 'email' };

    } catch (err) {
        // Clean up stored OTP if email failed Ã¢â‚¬â€ don't leave an undelivered code
        await deleteOtpPayload(redisKey).catch(() => null);
        logger.error({ orderId, error: err.message }, 'Ã¢ÂÅ’ Delivery OTP email failed');
        throw new Error('Failed to send delivery OTP. Please check the customer has a valid email and try again.');
    }
};

/**
 * Verify delivery OTP submitted by rider.
 * Handles locally-stored OTP (email/dev).
 *
 * @param {string} orderId - PostgreSQL order identifier
 * @param {string} otp - 6-digit code entered by rider
 * @returns {{ verified: boolean }}
 */
export const verifyDeliveryOTP = async (orderId, otp) => {
    const redisKey = `${OTP_REDIS_PREFIX}${orderId}`;

    // Retrieve from Redis first, PostgreSQL fallback second.
    const stored = await retrieveOtpPayload(redisKey);
    if (!stored) {
        throw new Error('OTP expired or not found. Please request a new code.');
    }

    let otpData;
    try {
        otpData = JSON.parse(stored);
    } catch {
        throw new Error('Invalid OTP session data. Please request a new code.');
    }

    const { method, otp: storedOtp } = otpData;

    // Ã¢â€â‚¬Ã¢â€â‚¬ Dev bypass Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    if (method === 'dev') {
        const verified = otp === '123456';
        if (verified) {
            // Delete immediately Ã¢â‚¬â€ one-time use only
            await deleteOtpPayload(redisKey);
        }
        return { verified };
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Email OTP verification Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    if (method === 'email' && storedOtp) {
        const verified = otp === storedOtp;
        if (verified) {
            // Delete immediately after first successful verification.
            // Prevents the same code being accepted a second time within TTL window.
            await deleteOtpPayload(redisKey);
            logger.info({ orderId }, 'Ã¢Å“â€¦ Delivery OTP verified and invalidated');
        }
        return { verified };
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Legacy SMS handler Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // Termii is no longer active. Any in-flight SMS OTPs from before cutover
    // will hit this branch and get a clear error directing rider to resend.
    if (method === 'sms') {
        throw new Error('SMS verification is no longer supported. Please tap "Resend Code" for a new OTP via email.');
    }

    throw new Error('Invalid OTP session state. Please request a new code.');
};

/**
 * Safely retrieve an active OTP for an order.
 * Used for displaying the code on the customer's tracking page.
 * 
 * @param {string} orderId 
 * @returns {string|null}
 */
export const getActiveDeliveryOTP = async (orderId) => {
    try {
        const redisKey = `${OTP_REDIS_PREFIX}${orderId}`;
        const stored = await retrieveOtpPayload(redisKey);
        if (!stored) return null;

        const otpData = JSON.parse(stored);
        return otpData.otp || null;
    } catch (error) {
        logger.error({ orderId, error: error.message }, 'Ã¢ÂÅ’ Error retrieving active OTP');
        return null;
    }
};

