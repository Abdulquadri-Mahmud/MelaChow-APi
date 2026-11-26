import crypto from "crypto";
import prisma from "../config/prisma.js";
import PlatformConfig from "../model/platform/PlatformConfig.model.js";
import { getPlatformConfig } from "./platformConfig.service.js";
import { platformConfigRepository } from "./postgres/platformConfig.repository.js";
import { usePostgresPlatformConfigReads } from "./postgres/compat.js";
import { buildPromoIdentity, hashPromoValue } from "../utils/promoIdentity.js";
import {
  DEFAULT_REFERRAL_CONFIG,
  canonicalizeEmailForFraud,
  generateCandidateReferralCode,
  normalizeAddressKeyForFraud,
  normalizeReferralConfig,
} from "../utils/referralConfig.js";
import logger from "../config/logger.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

let referralSchemaReadyPromise = null;

const REFERRAL_DDL_STATEMENTS = [
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reward_credit_kobo" INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS "referral_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "monthly_cap_override" INTEGER,
    "disabled_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_user_id_key" ON "referral_codes"("user_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_code_key" ON "referral_codes"("code")`,
  `CREATE INDEX IF NOT EXISTS "referral_codes_code_is_active_idx" ON "referral_codes"("code", "is_active")`,
  `CREATE TABLE IF NOT EXISTS "referral_attributions" (
    "id" UUID NOT NULL,
    "referrer_user_id" UUID NOT NULL,
    "referee_user_id" UUID NOT NULL,
    "referral_code_id" UUID NOT NULL,
    "referral_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'attributed',
    "qualifying_order_id" UUID,
    "qualifying_order_code" TEXT NOT NULL DEFAULT '',
    "qualifying_subtotal_kobo" INTEGER NOT NULL DEFAULT 0,
    "referrer_reward_kobo" INTEGER NOT NULL DEFAULT 0,
    "referee_reward_kobo" INTEGER NOT NULL DEFAULT 0,
    "signup_device_hash" TEXT,
    "signup_ip_hash" TEXT,
    "referee_phone_hash" TEXT,
    "referee_email_canonical" TEXT,
    "checkout_device_hash" TEXT,
    "checkout_address_hash" TEXT,
    "fraud_flags" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "rejection_reason" TEXT NOT NULL DEFAULT '',
    "reviewed_by_admin_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "attributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "qualified_at" TIMESTAMP(3),
    "rewarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "referral_attributions_referee_user_id_key" ON "referral_attributions"("referee_user_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "referral_attributions_qualifying_order_id_key" ON "referral_attributions"("qualifying_order_id")`,
  `CREATE INDEX IF NOT EXISTS "referral_attributions_referrer_user_id_status_idx" ON "referral_attributions"("referrer_user_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "referral_attributions_referrer_user_id_rewarded_at_idx" ON "referral_attributions"("referrer_user_id", "rewarded_at")`,
  `CREATE INDEX IF NOT EXISTS "referral_attributions_status_expires_at_idx" ON "referral_attributions"("status", "expires_at")`,
  `CREATE INDEX IF NOT EXISTS "referral_attributions_signup_ip_hash_created_at_idx" ON "referral_attributions"("signup_ip_hash", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "referral_attributions_signup_device_hash_idx" ON "referral_attributions"("signup_device_hash")`,
  `CREATE INDEX IF NOT EXISTS "referral_attributions_referee_phone_hash_idx" ON "referral_attributions"("referee_phone_hash")`,
  `CREATE INDEX IF NOT EXISTS "referral_attributions_checkout_address_hash_idx" ON "referral_attributions"("checkout_address_hash")`,
  `CREATE TABLE IF NOT EXISTS "reward_credit_ledgers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'referral_referrer',
    "source_ref_id" TEXT NOT NULL,
    "attribution_id" UUID,
    "original_amount_kobo" INTEGER NOT NULL,
    "remaining_amount_kobo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "expiring_notified_at" TIMESTAMP(3),
    "revoked_by_admin_id" TEXT,
    "revoked_reason" TEXT NOT NULL DEFAULT '',
    "redemptions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reward_credit_ledgers_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "reward_credit_ledgers_source_ref_id_key" ON "reward_credit_ledgers"("source_ref_id")`,
  `CREATE INDEX IF NOT EXISTS "reward_credit_ledgers_user_id_status_expires_at_idx" ON "reward_credit_ledgers"("user_id", "status", "expires_at")`,
  `CREATE INDEX IF NOT EXISTS "reward_credit_ledgers_status_expires_at_idx" ON "reward_credit_ledgers"("status", "expires_at")`,
];

/**
 * Ensures referral tables & orders.reward_credit_kobo exist even if Render starts
 * `node index.js` without running `prisma migrate deploy`. Cached once per boot.
 */
export async function ensureReferralSchemaReady() {
  if (!referralSchemaReadyPromise) {
    referralSchemaReadyPromise = (async () => {
      for (const sql of REFERRAL_DDL_STATEMENTS) {
        await prisma.$executeRawUnsafe(sql);
      }
      logger.info("Referral schema verified/ensured in PostgreSQL");
      return true;
    })().catch((err) => {
      referralSchemaReadyPromise = null;
      throw err;
    });
  }
  return referralSchemaReadyPromise;
}

function sha256(value) {
  const cleaned = String(value || "").trim().toLowerCase();
  if (!cleaned) return null;
  return crypto.createHash("sha256").update(cleaned).digest("hex");
}

function maskPersonName(user) {
  if (!user) return "MelaChow Friend";
  const first = String(user.firstname || user.fullName || "").trim().split(/\s+/)[0];
  const last = String(user.lastname || "").trim();
  if (first && last) return `${first} ${last[0].toUpperCase()}.`;
  if (first) return first;
  if (user.email) {
    const local = String(user.email).split("@")[0] || "Friend";
    return `${local.slice(0, 3)}***`;
  }
  return "MelaChow Friend";
}

async function resolveUserRow(userToken) {
  if (!userToken) return null;
  const token = String(userToken);
  return prisma.user.findFirst({
    where: UUID_RE.test(token) ? { id: token } : { legacyMongoId: token },
    select: {
      id: true,
      legacyMongoId: true,
      firstname: true,
      lastname: true,
      fullName: true,
      email: true,
      phone: true,
      totalOrders: true,
      isVerified: true,
      isActive: true,
      suspended: true,
      banned: true,
      createdAt: true,
    },
  });
}

export async function getReferralConfig() {
  try {
    const platformConfig = await getPlatformConfig();
    return normalizeReferralConfig(platformConfig?.referralConfig);
  } catch {
    return { ...DEFAULT_REFERRAL_CONFIG };
  }
}

export async function updateReferralConfig(adminToken, patch = {}) {
  const current = await getReferralConfig();
  const nextConfig = normalizeReferralConfig(patch, current);

  if (usePostgresPlatformConfigReads()) {
    await platformConfigRepository.updateAdminConfig(adminToken, {
      referralConfig: nextConfig,
    });
  } else {
    await PlatformConfig.findOneAndUpdate(
      { type: "singleton" },
      { $set: { referralConfig: nextConfig, lastUpdatedBy: adminToken || null } },
      { upsert: true, new: true }
    );
  }

  return nextConfig;
}

export async function getOrCreateReferralCode(userToken) {
  await ensureReferralSchemaReady();
  const user = await resolveUserRow(userToken);
  if (!user) throw new Error("User not found");

  const existing = await prisma.referralCode.findUnique({ where: { userId: user.id } });
  if (existing) return existing;

  const seed = user.firstname || user.fullName || user.email?.split("@")[0] || "CHOW";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateCandidateReferralCode(attempt < 5 ? seed : "CHOW");
    try {
      return await prisma.referralCode.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          code: candidate,
          isActive: true,
        },
      });
    } catch (err) {
      if (err?.code === "P2002") {
        // Could be race on userId or code collision
        const raceExisting = await prisma.referralCode.findUnique({ where: { userId: user.id } });
        if (raceExisting) return raceExisting;
        continue;
      }
      throw err;
    }
  }

  throw new Error("Could not generate unique referral code");
}

export async function getAvailableRewardCredits(userToken) {
  await ensureReferralSchemaReady();
  const user = await resolveUserRow(userToken);
  if (!user) {
    return {
      availableKobo: 0,
      availableNaira: 0,
      earliestExpiryAt: null,
      activeGrants: [],
    };
  }

  const now = new Date();
  const activeGrants = await prisma.rewardCreditLedger.findMany({
    where: {
      userId: user.id,
      status: "active",
      remainingAmountKobo: { gt: 0 },
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "asc" },
  });

  const availableKobo = activeGrants.reduce((sum, g) => sum + Number(g.remainingAmountKobo || 0), 0);

  return {
    availableKobo,
    availableNaira: Math.round(availableKobo) / 100,
    earliestExpiryAt: activeGrants[0]?.expiresAt || null,
    activeGrants: activeGrants.map((g) => ({
      id: g.id,
      source: g.source,
      originalAmountNaira: g.originalAmountKobo / 100,
      remainingAmountNaira: g.remainingAmountKobo / 100,
      expiresAt: g.expiresAt,
      createdAt: g.createdAt,
    })),
  };
}

export async function getCustomerReferralDashboard(userToken) {
  await ensureReferralSchemaReady();
  const user = await resolveUserRow(userToken);
  if (!user) throw new Error("User not found");

  const [config, codeRow, attributions, myAttribution, allCredits] = await Promise.all([
    getReferralConfig(),
    getOrCreateReferralCode(user.id),
    prisma.referralAttribution.findMany({
      where: { referrerUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.referralAttribution.findUnique({
      where: { refereeUserId: user.id },
    }),
    prisma.rewardCreditLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const refereeIds = [...new Set(attributions.map((a) => a.refereeUserId))];
  const referees = refereeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: refereeIds } },
        select: { id: true, firstname: true, lastname: true, fullName: true, email: true },
      })
    : [];
  const refereeMap = new Map(referees.map((r) => [r.id, r]));

  const now = new Date();
  let availableKobo = 0;
  let totalEarnedKobo = 0;
  let totalUsedKobo = 0;
  let totalExpiredKobo = 0;
  let earliestExpiryAt = null;

  const creditHistory = allCredits.map((g) => {
    const isExpired = g.status === "expired" || (g.status === "active" && new Date(g.expiresAt) <= now);
    const effectiveStatus = isExpired ? "expired" : g.status;
    totalEarnedKobo += g.originalAmountKobo;
    const spent = Math.max(0, g.originalAmountKobo - g.remainingAmountKobo);
    totalUsedKobo += spent;
    if (effectiveStatus === "active" && g.remainingAmountKobo > 0) {
      availableKobo += g.remainingAmountKobo;
      if (!earliestExpiryAt || new Date(g.expiresAt) < new Date(earliestExpiryAt)) {
        earliestExpiryAt = g.expiresAt;
      }
    } else if (effectiveStatus === "expired") {
      totalExpiredKobo += g.remainingAmountKobo;
    }

    return {
      id: g.id,
      source: g.source,
      originalAmountNaira: g.originalAmountKobo / 100,
      remainingAmountNaira: effectiveStatus === "active" ? g.remainingAmountKobo / 100 : 0,
      status: effectiveStatus,
      expiresAt: g.expiresAt,
      createdAt: g.createdAt,
    };
  });

  const referrals = attributions.map((a) => {
    const expired =
      ["attributed", "order_placed"].includes(a.status) && new Date(a.expiresAt) <= now;
    const effectiveStatus = expired ? "expired" : a.status;
    return {
      id: a.id,
      friendName: maskPersonName(refereeMap.get(a.refereeUserId)),
      status: effectiveStatus,
      rewardNaira: a.referrerRewardKobo / 100,
      qualifyingOrderCode: a.qualifyingOrderCode || null,
      qualifyingSubtotalNaira: a.qualifyingSubtotalKobo / 100,
      attributedAt: a.attributedAt,
      expiresAt: a.expiresAt,
      rewardedAt: a.rewardedAt,
      rejectionReason: a.rejectionReason || null,
    };
  });

  const stats = {
    totalInvited: referrals.length,
    pendingCount: referrals.filter((r) => ["attributed", "order_placed", "pending_review"].includes(r.status)).length,
    rewardedCount: referrals.filter((r) => r.status === "rewarded").length,
    expiredCount: referrals.filter((r) => r.status === "expired").length,
    rejectedCount: referrals.filter((r) => r.status === "rejected_fraud").length,
  };

  const baseAppUrl = (process.env.CLIENT_URL || "https://melachow.com").replace(/\/+$/, "");

  return {
    config: {
      enabled: config.enabled,
      rewardMode: config.rewardMode,
      referrerRewardNaira: config.referrerRewardNaira,
      refereeRewardNaira: config.refereeRewardNaira,
      minOrderSubtotalNaira: config.minOrderSubtotalNaira,
      creditSpendScope: config.creditSpendScope,
      creditExpiryDays: config.creditExpiryDays,
      attributionExpiryDays: config.attributionExpiryDays,
      issuanceTrigger: config.issuanceTrigger,
      maxCreditPerOrderNaira: config.maxCreditPerOrderNaira,
      allowStackWithCoupons: config.allowStackWithCoupons,
      allowStackWithFreeDelivery: config.allowStackWithFreeDelivery,
    },
    code: codeRow.code,
    isActive: codeRow.isActive,
    shareLink: `${baseAppUrl}/auth/signup?ref=${encodeURIComponent(codeRow.code)}`,
    credits: {
      availableKobo,
      availableNaira: availableKobo / 100,
      totalEarnedNaira: totalEarnedKobo / 100,
      totalUsedNaira: totalUsedKobo / 100,
      totalExpiredNaira: totalExpiredKobo / 100,
      earliestExpiryAt,
      history: creditHistory,
    },
    stats,
    referrals,
    myAttribution: myAttribution
      ? {
          code: myAttribution.referralCode,
          status:
            ["attributed", "order_placed"].includes(myAttribution.status) &&
            new Date(myAttribution.expiresAt) <= now
              ? "expired"
              : myAttribution.status,
          expiresAt: myAttribution.expiresAt,
          rewardedAt: myAttribution.rewardedAt,
        }
      : null,
  };
}

export async function attributeReferral({
  refereeUserToken,
  code,
  deviceId = null,
  ip = null,
  phone = null,
  email = null,
}) {
  await ensureReferralSchemaReady();
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) return { attributed: false, reason: "missing_code" };

  const config = await getReferralConfig();
  if (!config.enabled) {
    return { attributed: false, reason: "program_disabled", message: "The referral program is currently paused." };
  }

  const referee = await resolveUserRow(refereeUserToken);
  if (!referee) return { attributed: false, reason: "referee_not_found", message: "Account not found." };

  const existingAttr = await prisma.referralAttribution.findUnique({
    where: { refereeUserId: referee.id },
  });
  if (existingAttr) {
    return { attributed: false, reason: "already_attributed", message: "A referral code has already been applied to your account." };
  }

  // Must be a new customer with zero prior paid/completed orders
  const priorOrderCount = await prisma.order.count({
    where: {
      userId: referee.id,
      orderStatus: { notIn: ["cancelled", "failed", "refunded"] },
    },
  });
  if (priorOrderCount > 0 || Number(referee.totalOrders || 0) > 0) {
    return { attributed: false, reason: "existing_customer", message: "Referral codes only apply to new customers before their first order." };
  }

  const codeRow = await prisma.referralCode.findFirst({
    where: { code: cleanCode, isActive: true },
  });
  if (!codeRow) {
    return { attributed: false, reason: "invalid_code", message: "Invalid or inactive referral code." };
  }

  if (codeRow.userId === referee.id) {
    return { attributed: false, reason: "self_referral", message: "You cannot use your own referral code." };
  }

  const referrer = await prisma.user.findUnique({
    where: { id: codeRow.userId },
    select: { id: true, email: true, phone: true, isActive: true, suspended: true, banned: true },
  });
  if (!referrer || !referrer.isActive || referrer.suspended || referrer.banned) {
    return { attributed: false, reason: "referrer_ineligible", message: "This referral code is no longer active." };
  }

  const promoId = buildPromoIdentity({ deviceId, phone: phone || referee.phone });
  const referrerPhoneHash = buildPromoIdentity({ phone: referrer.phone }).phoneHash;
  const refereeCanonicalEmail = canonicalizeEmailForFraud(email || referee.email);
  const referrerCanonicalEmail = canonicalizeEmailForFraud(referrer.email);
  const ipHash = ip ? sha256(`referral-ip:${ip}`) : null;

  // Hard fraud checks (auto-reject immediately)
  if (refereeCanonicalEmail && referrerCanonicalEmail && refereeCanonicalEmail === referrerCanonicalEmail) {
    return { attributed: false, reason: "duplicate_email_alias", message: "This account is not eligible for this referral code." };
  }

  if (promoId.phoneHash && referrerPhoneHash && promoId.phoneHash === referrerPhoneHash) {
    return { attributed: false, reason: "shared_phone", message: "This phone number is already linked to the referrer." };
  }

  if (promoId.phoneHash) {
    const phoneReuse = await prisma.referralAttribution.findFirst({
      where: { refereePhoneHash: promoId.phoneHash },
      select: { id: true },
    });
    if (phoneReuse) {
      return { attributed: false, reason: "phone_already_referred", message: "This phone number has already used a referral code." };
    }
  }

  if (promoId.hashedDeviceId) {
    const deviceReuse = await prisma.referralAttribution.findFirst({
      where: {
        OR: [
          { signupDeviceHash: promoId.hashedDeviceId },
          { checkoutDeviceHash: promoId.hashedDeviceId },
        ],
      },
      select: { id: true },
    });
    if (deviceReuse) {
      return { attributed: false, reason: "device_already_referred", message: "This device has already been used for a referral." };
    }
  }

  // Soft fraud signals (recorded for review at reward issuance)
  const fraudFlags = [];
  if (ipHash) {
    const last24h = new Date(Date.now() - DAY_MS);
    const ipCount = await prisma.referralAttribution.count({
      where: { signupIpHash: ipHash, createdAt: { gte: last24h } },
    });
    if (ipCount >= config.maxReferralsPerIp24h) {
      fraudFlags.push({
        code: "ip_velocity_24h",
        detail: `${ipCount + 1} referral signups from same IP in 24h`,
        at: new Date().toISOString(),
      });
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.attributionExpiryDays * DAY_MS);

  const attribution = await prisma.referralAttribution.create({
    data: {
      id: crypto.randomUUID(),
      referrerUserId: referrer.id,
      refereeUserId: referee.id,
      referralCodeId: codeRow.id,
      referralCode: codeRow.code,
      status: "attributed",
      signupDeviceHash: promoId.hashedDeviceId,
      signupIpHash: ipHash,
      refereePhoneHash: promoId.phoneHash,
      refereeEmailCanonical: refereeCanonicalEmail,
      fraudFlags,
      attributedAt: now,
      expiresAt,
    },
  });

  return {
    attributed: true,
    attribution,
    message: `Referral code ${codeRow.code} applied! Complete an eligible order of ₦${config.minOrderSubtotalNaira.toLocaleString("en-NG")}+ within ${config.attributionExpiryDays} day${config.attributionExpiryDays === 1 ? "" : "s"}.`,
  };
}

/**
 * Called atomically inside order creation (Postgres transaction).
 * Enforces food-subtotal-only scope, FIFO earliest-expiry consumption, and Super Admin rules.
 */
export async function reserveRewardCreditsInTx(
  tx,
  {
    userId,
    orderId,
    orderCode,
    foodSubtotalKobo,
    useRewardCredits = false,
    hasCoupon = false,
    hasFreeDelivery = false,
    platformConfig = null,
  }
) {
  if (!useRewardCredits || foodSubtotalKobo <= 0) {
    return { appliedKobo: 0, grantsUsed: [] };
  }

  const config = normalizeReferralConfig(platformConfig?.referralConfig);
  if (!config.enabled) {
    return { appliedKobo: 0, grantsUsed: [] };
  }

  if (hasCoupon && !config.allowStackWithCoupons) {
    throw new Error("Reward credits cannot be combined with a coupon code on the same order.");
  }
  if (hasFreeDelivery && !config.allowStackWithFreeDelivery) {
    throw new Error("Reward credits cannot be combined with free delivery promos on this order.");
  }

  const now = new Date();
  const activeGrants = await tx.rewardCreditLedger.findMany({
    where: {
      userId,
      status: "active",
      remainingAmountKobo: { gt: 0 },
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "asc" },
  });

  if (!activeGrants.length) {
    return { appliedKobo: 0, grantsUsed: [] };
  }

  // Food subtotal only — never covers delivery fee or service fee
  let capKobo = Math.max(0, Number(foodSubtotalKobo) || 0);
  if (config.maxCreditPerOrderNaira > 0) {
    capKobo = Math.min(capKobo, Math.round(config.maxCreditPerOrderNaira * 100));
  }

  let remainingToApply = capKobo;
  let totalAppliedKobo = 0;
  const grantsUsed = [];

  for (const grant of activeGrants) {
    if (remainingToApply <= 0) break;
    const take = Math.min(grant.remainingAmountKobo, remainingToApply);
    if (take <= 0) continue;

    const nextRemaining = grant.remainingAmountKobo - take;
    const prevRedemptions = Array.isArray(grant.redemptions) ? grant.redemptions : [];
    const updated = await tx.rewardCreditLedger.updateMany({
      where: {
        id: grant.id,
        status: "active",
        remainingAmountKobo: grant.remainingAmountKobo,
      },
      data: {
        remainingAmountKobo: nextRemaining,
        status: nextRemaining === 0 ? "used" : "active",
        redemptions: [
          ...prevRedemptions,
          {
            orderId,
            orderCode,
            amountKobo: take,
            redeemedAt: now.toISOString(),
            restoredAt: null,
          },
        ],
      },
    });

    if (updated.count !== 1) {
      throw new Error("Your reward credit balance changed. Please retry checkout.");
    }

    totalAppliedKobo += take;
    remainingToApply -= take;
    grantsUsed.push({ grantId: grant.id, amountKobo: take });
  }

  return { appliedKobo: totalAppliedKobo, grantsUsed };
}

/**
 * Restores reward credits when an unpaid/cancelled/failed order is rolled back.
 */
export async function restoreRewardCreditsForOrder(orderId) {
  await ensureReferralSchemaReady();
  if (!orderId || !UUID_RE.test(String(orderId))) return { restoredKobo: 0 };

  const order = await prisma.order.findUnique({
    where: { id: String(orderId) },
    select: { id: true, userId: true, rewardCreditKobo: true },
  });
  if (!order || !order.rewardCreditKobo || order.rewardCreditKobo <= 0) {
    return { restoredKobo: 0 };
  }

  const now = new Date();
  const grants = await prisma.rewardCreditLedger.findMany({
    where: {
      userId: order.userId,
      status: { in: ["active", "used"] },
    },
  });

  let restoredKobo = 0;
  for (const grant of grants) {
    const redemptions = Array.isArray(grant.redemptions) ? grant.redemptions : [];
    let grantRestore = 0;
    const nextRedemptions = redemptions.map((entry) => {
      if (String(entry?.orderId) === String(order.id) && !entry.restoredAt) {
        grantRestore += Number(entry.amountKobo || 0);
        return { ...entry, restoredAt: now.toISOString() };
      }
      return entry;
    });

    if (grantRestore > 0) {
      const stillValid = new Date(grant.expiresAt) > now;
      await prisma.rewardCreditLedger.update({
        where: { id: grant.id },
        data: {
          remainingAmountKobo: Math.min(grant.originalAmountKobo, grant.remainingAmountKobo + grantRestore),
          status: stillValid ? "active" : "expired",
          redemptions: nextRedemptions,
        },
      });
      restoredKobo += grantRestore;
    }
  }

  return { restoredKobo };
}

/**
 * Triggered immediately when rider marks Delivered (default) or Completed (configurable).
 * Strictly idempotent via unique sourceRefId on RewardCreditLedger.
 */
export async function evaluateAndIssueReferralRewardForOrder({
  orderToken,
  trigger = "on_delivered",
  deviceId = null,
}) {
  try {
    await ensureReferralSchemaReady();
    const config = await getReferralConfig();
    if (!config.enabled) return { issued: false, reason: "program_disabled" };
    if (config.issuanceTrigger !== trigger) return { issued: false, reason: "trigger_mismatch" };

    const tokenStr = String(orderToken || "");
    if (!tokenStr) return { issued: false, reason: "missing_order" };

    const order = await prisma.order.findFirst({
      where: UUID_RE.test(tokenStr)
        ? { id: tokenStr }
        : { OR: [{ legacyMongoId: tokenStr }, { orderCode: tokenStr }] },
      include: {
        user: {
          select: {
            id: true,
            legacyMongoId: true,
            firstname: true,
            lastname: true,
            fullName: true,
            email: true,
            phone: true,
            isVerified: true,
            isActive: true,
            suspended: true,
            banned: true,
          },
        },
      },
    });

    if (!order || !order.user) return { issued: false, reason: "order_not_found" };
    if (order.paymentStatus !== "paid") return { issued: false, reason: "unpaid" };
    if (!["delivered", "completed"].includes(String(order.orderStatus || "").toLowerCase())) {
      return { issued: false, reason: "not_delivered" };
    }

    const attribution = await prisma.referralAttribution.findUnique({
      where: { refereeUserId: order.userId },
    });
    if (!attribution) return { issued: false, reason: "no_attribution" };
    if (!["attributed", "order_placed"].includes(attribution.status)) {
      return { issued: false, reason: `already_${attribution.status}` };
    }

    const now = new Date();
    // Check attribution window (default 2 days from signup)
    if (new Date(attribution.expiresAt) < new Date(order.createdAt)) {
      await prisma.referralAttribution.update({
        where: { id: attribution.id },
        data: { status: "expired", rejectionReason: "Attribution window expired before first qualifying order." },
      });
      return { issued: false, reason: "attribution_expired" };
    }

    // Referee must be verified & active
    if (!order.user.isVerified || !order.user.isActive || order.user.suspended || order.user.banned) {
      return { issued: false, reason: "referee_ineligible" };
    }

    // Check minimum food subtotal (default ₦2,500 = 250,000 kobo)
    const minSubtotalKobo = Math.round(config.minOrderSubtotalNaira * 100);
    if (Number(order.subtotal || 0) < minSubtotalKobo) {
      return { issued: false, reason: "below_min_subtotal" };
    }

    // Ensure this is the referee's FIRST delivered/completed order
    const priorCompleted = await prisma.order.count({
      where: {
        userId: order.userId,
        id: { not: order.id },
        orderStatus: { in: ["delivered", "completed"] },
      },
    });
    if (priorCompleted > 0) {
      await prisma.referralAttribution.update({
        where: { id: attribution.id },
        data: { status: "expired", rejectionReason: "Referee already had a prior completed order." },
      });
      return { issued: false, reason: "not_first_order" };
    }

    // Check referrer & code eligibility
    const [referrer, codeRow] = await Promise.all([
      prisma.user.findUnique({
        where: { id: attribution.referrerUserId },
        select: { id: true, legacyMongoId: true, isActive: true, suspended: true, banned: true },
      }),
      prisma.referralCode.findUnique({ where: { id: attribution.referralCodeId } }),
    ]);

    if (!referrer || !referrer.isActive || referrer.suspended || referrer.banned || !codeRow?.isActive) {
      await prisma.referralAttribution.update({
        where: { id: attribution.id },
        data: { status: "rejected_fraud", rejectionReason: "Referrer account or code is inactive." },
      });
      return { issued: false, reason: "referrer_inactive" };
    }

    // Check monthly cap for referrer
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyCount = await prisma.referralAttribution.count({
      where: {
        referrerUserId: referrer.id,
        status: "rewarded",
        rewardedAt: { gte: monthStart },
      },
    });
    const effectiveCap = codeRow.monthlyCapOverride ?? config.maxRewardsPerUserPerMonth;
    if (monthlyCount >= effectiveCap) {
      await prisma.referralAttribution.update({
        where: { id: attribution.id },
        data: {
          status: "rejected_fraud",
          qualifyingOrderId: order.id,
          qualifyingOrderCode: order.orderCode,
          qualifyingSubtotalKobo: order.subtotal,
          rejectionReason: `Referrer monthly reward cap (${effectiveCap}) reached.`,
        },
      });
      return { issued: false, reason: "monthly_cap_reached" };
    }

    // Checkout fraud checks (address clustering + existing signup soft flags)
    const fraudFlags = Array.isArray(attribution.fraudFlags) ? [...attribution.fraudFlags] : [];
    const addressKey = normalizeAddressKeyForFraud(order.deliveryAddress);
    const addressHash = addressKey ? sha256(`referral-addr:${addressKey}`) : null;
    const checkoutDeviceHash = deviceId ? hashPromoValue(deviceId) : null;

    if (addressHash) {
      const sameAddressCount = await prisma.referralAttribution.count({
        where: {
          checkoutAddressHash: addressHash,
          status: { in: ["rewarded", "pending_review"] },
          id: { not: attribution.id },
        },
      });
      if (sameAddressCount >= config.maxReferralsPerAddress) {
        fraudFlags.push({
          code: "delivery_address_cluster",
          detail: `${sameAddressCount + 1} referral orders delivered to same address cluster`,
          at: now.toISOString(),
        });
      }
    }

    const referrerRewardKobo = Math.round(config.referrerRewardNaira * 100);
    const refereeRewardKobo =
      config.rewardMode === "two_sided" ? Math.round(config.refereeRewardNaira * 100) : 0;

    // Route soft-flagged referrals to Super Admin review queue instead of auto-crediting
    if (fraudFlags.length > 0) {
      await prisma.referralAttribution.update({
        where: { id: attribution.id },
        data: {
          status: "pending_review",
          qualifyingOrderId: order.id,
          qualifyingOrderCode: order.orderCode,
          qualifyingSubtotalKobo: order.subtotal,
          referrerRewardKobo,
          refereeRewardKobo,
          checkoutDeviceHash,
          checkoutAddressHash: addressHash,
          fraudFlags,
          qualifiedAt: now,
        },
      });
      return { issued: false, reason: "pending_admin_review", fraudFlags };
    }

    // Clean & eligible -> issue reward credit immediately inside an atomic transaction!
    const creditExpiresAt = new Date(now.getTime() + config.creditExpiryDays * DAY_MS);

    await issueCreditGrantsAtomically({
      attributionId: attribution.id,
      referrerUserId: referrer.id,
      refereeUserId: order.userId,
      orderId: order.id,
      orderCode: order.orderCode,
      subtotalKobo: order.subtotal,
      referrerRewardKobo,
      refereeRewardKobo,
      checkoutDeviceHash,
      checkoutAddressHash: addressHash,
      creditExpiresAt,
      now,
    });

    // Best-effort in-app / push notification to referrer
    try {
      const { sendNotification } = await import("./notification.service.js");
      const friendLabel = maskPersonName(order.user);
      await sendNotification(
        referrer.legacyMongoId || referrer.id,
        "promo",
        {
          title: `You earned ₦${config.referrerRewardNaira.toLocaleString("en-NG")} MelaChow Credit!`,
          message: `${friendLabel} completed their first eligible order. Your ₦${config.referrerRewardNaira.toLocaleString("en-NG")} reward credit is ready to use on food orders (expires in ${config.creditExpiryDays} days).`,
          url: "/profile/referrals",
        },
        "user"
      );
    } catch (notifyErr) {
      logger.warn({ err: notifyErr.message }, "Referral reward notification failed (non-fatal)");
    }

    return { issued: true, referrerRewardKobo, refereeRewardKobo, creditExpiresAt };
  } catch (error) {
    logger.error({ err: error.message, orderToken }, "Referral reward evaluation failed");
    return { issued: false, reason: "error", error: error.message };
  }
}

async function issueCreditGrantsAtomically({
  attributionId,
  referrerUserId,
  refereeUserId,
  orderId,
  orderCode,
  subtotalKobo,
  referrerRewardKobo,
  refereeRewardKobo,
  checkoutDeviceHash,
  checkoutAddressHash,
  creditExpiresAt,
  now,
  reviewedByAdminId = null,
}) {
  return prisma.$transaction(async (tx) => {
    await tx.referralAttribution.update({
      where: { id: attributionId },
      data: {
        status: "rewarded",
        ...(orderId ? { qualifyingOrderId: orderId } : {}),
        ...(orderCode ? { qualifyingOrderCode: orderCode } : {}),
        ...(subtotalKobo != null ? { qualifyingSubtotalKobo: subtotalKobo } : {}),
        referrerRewardKobo,
        refereeRewardKobo,
        ...(checkoutDeviceHash ? { checkoutDeviceHash } : {}),
        ...(checkoutAddressHash ? { checkoutAddressHash } : {}),
        qualifiedAt: now,
        rewardedAt: now,
        ...(reviewedByAdminId ? { reviewedByAdminId, reviewedAt: now } : {}),
      },
    });

    if (referrerRewardKobo > 0) {
      await tx.rewardCreditLedger.upsert({
        where: { sourceRefId: `referral:${attributionId}:referrer` },
        create: {
          id: crypto.randomUUID(),
          userId: referrerUserId,
          source: "referral_referrer",
          sourceRefId: `referral:${attributionId}:referrer`,
          attributionId,
          originalAmountKobo: referrerRewardKobo,
          remainingAmountKobo: referrerRewardKobo,
          status: "active",
          expiresAt: creditExpiresAt,
        },
        update: {},
      });
    }

    if (refereeRewardKobo > 0 && refereeUserId) {
      await tx.rewardCreditLedger.upsert({
        where: { sourceRefId: `referral:${attributionId}:referee` },
        create: {
          id: crypto.randomUUID(),
          userId: refereeUserId,
          source: "referral_referee",
          sourceRefId: `referral:${attributionId}:referee`,
          attributionId,
          originalAmountKobo: refereeRewardKobo,
          remainingAmountKobo: refereeRewardKobo,
          status: "active",
          expiresAt: creditExpiresAt,
        },
        update: {},
      });
    }
  });
}

/**
 * Periodic expiry sweep: marks expired attributions & expired reward credits,
 * and sends a gentle reminder when credits have < 12 hours left.
 */
export async function expireStaleReferralsAndCredits() {
  await ensureReferralSchemaReady();
  const now = new Date();
  const [expiredAttributions, expiredCredits] = await Promise.all([
    prisma.referralAttribution.updateMany({
      where: {
        status: { in: ["attributed", "order_placed"] },
        expiresAt: { lte: now },
      },
      data: {
        status: "expired",
        rejectionReason: "Attribution window elapsed before qualifying order.",
      },
    }),
    prisma.rewardCreditLedger.updateMany({
      where: {
        status: "active",
        expiresAt: { lte: now },
      },
      data: {
        status: "expired",
      },
    }),
  ]);

  // Notify users whose credits expire within 12 hours (once per grant)
  const soonWindow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const expiringSoon = await prisma.rewardCreditLedger.findMany({
    where: {
      status: "active",
      remainingAmountKobo: { gt: 0 },
      expiresAt: { gt: now, lte: soonWindow },
      expiringNotifiedAt: null,
    },
    take: 50,
  });

  if (expiringSoon.length) {
    try {
      const { sendNotification } = await import("./notification.service.js");
      const users = await prisma.user.findMany({
        where: { id: { in: [...new Set(expiringSoon.map((g) => g.userId))] } },
        select: { id: true, legacyMongoId: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      for (const grant of expiringSoon) {
        const u = userMap.get(grant.userId);
        if (u) {
          await sendNotification(
            u.legacyMongoId || u.id,
            "promo",
            {
              title: "Your MelaChow Reward Credit expires soon!",
              message: `Use your ₦${(grant.remainingAmountKobo / 100).toLocaleString("en-NG")} reward credit on your next food order before it expires.`,
              url: "/profile/referrals",
            },
            "user"
          ).catch(() => {});
        }
        await prisma.rewardCreditLedger.update({
          where: { id: grant.id },
          data: { expiringNotifiedAt: now },
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return {
    expiredAttributions: expiredAttributions.count,
    expiredCredits: expiredCredits.count,
    remindedCount: expiringSoon.length,
  };
}

// ─── SUPER ADMIN SERVICES ─────────────────────────────────────────────────────

export async function getAdminReferralOverview() {
  await ensureReferralSchemaReady();
  const now = new Date();
  const [config, totalCodes, attributions, credits] = await Promise.all([
    getReferralConfig(),
    prisma.referralCode.count(),
    prisma.referralAttribution.findMany({
      select: { status: true, expiresAt: true, referrerRewardKobo: true, refereeRewardKobo: true },
    }),
    prisma.rewardCreditLedger.findMany({
      select: { status: true, originalAmountKobo: true, remainingAmountKobo: true, expiresAt: true },
    }),
  ]);

  let attributed = 0;
  let pendingReview = 0;
  let rewarded = 0;
  let rejectedFraud = 0;
  let expired = 0;

  for (const a of attributions) {
    const isExp = ["attributed", "order_placed"].includes(a.status) && new Date(a.expiresAt) <= now;
    const st = isExp ? "expired" : a.status;
    if (st === "rewarded") rewarded += 1;
    else if (st === "pending_review") pendingReview += 1;
    else if (st === "rejected_fraud") rejectedFraud += 1;
    else if (st === "expired") expired += 1;
    else attributed += 1;
  }

  let issuedKobo = 0;
  let redeemedKobo = 0;
  let activeUnspentKobo = 0;
  let expiredUnspentKobo = 0;
  let revokedKobo = 0;

  for (const c of credits) {
    const isExp = c.status === "expired" || (c.status === "active" && new Date(c.expiresAt) <= now);
    issuedKobo += c.originalAmountKobo;
    redeemedKobo += Math.max(0, c.originalAmountKobo - c.remainingAmountKobo);
    if (c.status === "revoked") revokedKobo += c.remainingAmountKobo;
    else if (isExp) expiredUnspentKobo += c.remainingAmountKobo;
    else if (c.status === "active") activeUnspentKobo += c.remainingAmountKobo;
  }

  const totalAttributions = attributions.length;
  const conversionRate = totalAttributions > 0 ? Math.round((rewarded / totalAttributions) * 1000) / 10 : 0;

  return {
    config,
    kpis: {
      totalCodes,
      totalAttributions,
      attributed,
      pendingReview,
      rewarded,
      rejectedFraud,
      expired,
      conversionRate,
      creditsIssuedNaira: issuedKobo / 100,
      creditsRedeemedNaira: redeemedKobo / 100,
      creditsActiveNaira: activeUnspentKobo / 100,
      creditsExpiredNaira: expiredUnspentKobo / 100,
      creditsRevokedNaira: revokedKobo / 100,
    },
  };
}

export async function listAdminReferralAttributions({ status = "all", search = "", page = 1, limit = 25 }) {
  await ensureReferralSchemaReady();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));

  const where = {};
  if (status && status !== "all") {
    where.status = String(status);
  }
  if (search && String(search).trim()) {
    const q = String(search).trim();
    where.OR = [
      { referralCode: { contains: q, mode: "insensitive" } },
      { qualifyingOrderCode: { contains: q, mode: "insensitive" } },
      { refereeEmailCanonical: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.referralAttribution.count({ where }),
    prisma.referralAttribution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
  ]);

  const userIds = [...new Set(rows.flatMap((r) => [r.referrerUserId, r.refereeUserId]))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, legacyMongoId: true, firstname: true, lastname: true, fullName: true, email: true, phone: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const creditRows = rows.length
    ? await prisma.rewardCreditLedger.findMany({
        where: { attributionId: { in: rows.map((r) => r.id) } },
      })
    : [];
  const creditsByAttr = new Map();
  for (const c of creditRows) {
    if (!creditsByAttr.has(c.attributionId)) creditsByAttr.set(c.attributionId, []);
    creditsByAttr.get(c.attributionId).push(c);
  }

  return {
    items: rows.map((r) => ({
      ...r,
      referrer: userMap.get(r.referrerUserId) || null,
      referee: userMap.get(r.refereeUserId) || null,
      qualifyingSubtotalNaira: r.qualifyingSubtotalKobo / 100,
      referrerRewardNaira: r.referrerRewardKobo / 100,
      refereeRewardNaira: r.refereeRewardKobo / 100,
      credits: (creditsByAttr.get(r.id) || []).map((c) => ({
        id: c.id,
        source: c.source,
        originalAmountNaira: c.originalAmountKobo / 100,
        remainingAmountNaira: c.remainingAmountKobo / 100,
        status: c.status,
        expiresAt: c.expiresAt,
      })),
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

export async function reviewAdminReferralAttribution({ attributionId, adminId, decision, reason = "" }) {
  await ensureReferralSchemaReady();
  const attr = await prisma.referralAttribution.findUnique({ where: { id: String(attributionId) } });
  if (!attr) throw new Error("Referral attribution not found");
  if (!["pending_review", "attributed", "order_placed"].includes(attr.status)) {
    throw new Error(`Cannot review attribution in '${attr.status}' status`);
  }

  const now = new Date();
  if (decision === "reject") {
    return prisma.referralAttribution.update({
      where: { id: attr.id },
      data: {
        status: "rejected_fraud",
        rejectionReason: String(reason || "Rejected by Super Admin during fraud review").slice(0, 240),
        reviewedByAdminId: String(adminId || ""),
        reviewedAt: now,
      },
    });
  }

  if (decision === "approve") {
    const config = await getReferralConfig();
    const referrerRewardKobo = attr.referrerRewardKobo || Math.round(config.referrerRewardNaira * 100);
    const refereeRewardKobo =
      attr.refereeRewardKobo ||
      (config.rewardMode === "two_sided" ? Math.round(config.refereeRewardNaira * 100) : 0);
    const creditExpiresAt = new Date(now.getTime() + config.creditExpiryDays * DAY_MS);

    await issueCreditGrantsAtomically({
      attributionId: attr.id,
      referrerUserId: attr.referrerUserId,
      refereeUserId: attr.refereeUserId,
      orderId: attr.qualifyingOrderId,
      orderCode: attr.qualifyingOrderCode,
      subtotalKobo: attr.qualifyingSubtotalKobo,
      referrerRewardKobo,
      refereeRewardKobo,
      creditExpiresAt,
      now,
      reviewedByAdminId: String(adminId || ""),
    });

    return prisma.referralAttribution.findUnique({ where: { id: attr.id } });
  }

  throw new Error("Decision must be 'approve' or 'reject'");
}

export async function revokeAdminRewardCredit({ creditId, adminId, reason = "" }) {
  await ensureReferralSchemaReady();
  const credit = await prisma.rewardCreditLedger.findUnique({ where: { id: String(creditId) } });
  if (!credit) throw new Error("Reward credit grant not found");
  if (credit.status === "revoked") return credit;

  return prisma.rewardCreditLedger.update({
    where: { id: credit.id },
    data: {
      status: "revoked",
      remainingAmountKobo: 0,
      revokedByAdminId: String(adminId || ""),
      revokedReason: String(reason || "Revoked by Super Admin").slice(0, 240),
    },
  });
}

export async function toggleAdminReferralCode({ userId, isActive, monthlyCapOverride, disabledReason = "" }) {
  await ensureReferralSchemaReady();
  const user = await resolveUserRow(userId);
  if (!user) throw new Error("User not found");
  const codeRow = await getOrCreateReferralCode(user.id);

  return prisma.referralCode.update({
    where: { id: codeRow.id },
    data: {
      ...(typeof isActive === "boolean" ? { isActive } : {}),
      ...(monthlyCapOverride !== undefined
        ? { monthlyCapOverride: monthlyCapOverride === null || monthlyCapOverride === "" ? null : Math.max(1, Number(monthlyCapOverride)) }
        : {}),
      disabledReason: isActive === false ? String(disabledReason || "Disabled by Super Admin").slice(0, 240) : "",
    },
  });
}
