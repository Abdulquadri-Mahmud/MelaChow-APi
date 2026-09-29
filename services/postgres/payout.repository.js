import prisma from "../../config/prisma.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resolve = async (model, value) => {
  if (!value) return null;
  if (uuid.test(String(value))) return String(value);
  return (await model.findUnique({ where: { legacyMongoId: String(value) }, select: { id: true } }))?.id || null;
};
const modelFor = (type, tx = prisma) => type === "vendor" ? tx.withdrawal : tx.riderWithdrawal;
const ownerModelFor = (type, tx = prisma) => type === "vendor" ? tx.vendor : tx.rider;
const ownerFieldFor = (type) => type === "vendor" ? "vendorId" : "riderId";
const activeKey = (type, ownerId) => `${type}:${ownerId}`;
const fromKobo = (value) => Number(value || 0) / 100;

export const payoutShape = (row) => row ? ({
  ...row, _id: row.legacyMongoId || row.id,
  vendorId: row.vendor?.legacyMongoId || row.vendorId,
  riderId: row.rider?.legacyMongoId || row.riderId,
  walletId: row.wallet?.legacyMongoId || row.walletId,
  requestedAmount: fromKobo(row.requestedAmount), transferFee: fromKobo(row.transferFee),
  netAmount: fromKobo(row.netAmount), appliedMarkup: fromKobo(row.appliedMarkup),
  retryOf: row.retryOf?.legacyMongoId || row.retryOfId || null,
}) : null;

export const payoutRepository = {
  async findById(tokenId) {
    for (const type of ["vendor", "rider"]) {
      const model = modelFor(type);
      const id = await resolve(model, tokenId);
      if (!id) continue;
      const row = await model.findUnique({ where: { id } });
      if (row) return { type, withdrawal: payoutShape(row), raw: row };
    }
    return null;
  },
  async findByReference(reference) {
    for (const type of ["vendor", "rider"]) {
      const row = await modelFor(type).findUnique({ where: { paystackReference: reference } });
      if (row) return { type, withdrawal: payoutShape(row), raw: row };
    }
    return null;
  },

  async listStale({ olderThanMinutes = 10, limit = 100 } = {}) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60000);
    const [vendors, riders] = await Promise.all([
      prisma.withdrawal.findMany({ where: { status: { in: ["pending", "processing"] }, updatedAt: { lte: cutoff } }, select: { paystackReference: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: limit }),
      prisma.riderWithdrawal.findMany({ where: { status: { in: ["pending", "processing"] }, updatedAt: { lte: cutoff } }, select: { paystackReference: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: limit }),
    ]);
    return [...vendors, ...riders].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, limit);
  },

  async applyProviderOutcome(type, reference, providerData, source = "webhook") {
    const providerStatus = String(providerData?.status || "").toLowerCase();
    const failures = new Set(["failed", "reversed"]), inFlight = new Set(["pending", "processing", "otp"]);
    return prisma.$transaction(async tx => {
      const model = modelFor(type, tx);
      const row = await model.findUnique({ where: { paystackReference: reference } });
      if (!row) return { found: false, reference, providerStatus };
      const before = row.status, providerAmount = Number(providerData?.amount);
      const amountMismatch = Number.isFinite(providerAmount) && providerAmount !== row.netAmount;
      let outcome = amountMismatch ? "amount_mismatch" : "matched";
      const history = Array.isArray(row.reconciliationHistory) ? row.reconciliationHistory : [];
      const data = { providerStatus, lastVerifiedAt: new Date(), reconciliationAttempts: { increment: 1 }, lastProviderPayload: providerData || {}, providerFailureReason: failures.has(providerStatus) ? (providerData?.reason || providerData?.gateway_response || "Transfer failed") : null };
      if (amountMismatch) data.reconciliationStatus = "amount_mismatch";
      else if (providerStatus === "success") {
        if (row.fundsRestoredAt || failures.has(before)) { outcome = "manual_review"; Object.assign(data, { reconciliationStatus: "manual_review", failureReason: "CRITICAL: Paystack reports success after local funds were restored" }); }
        else Object.assign(data, { status: "completed", settledAt: providerData?.transferred_at ? new Date(providerData.transferred_at) : new Date(), providerTransferredAt: providerData?.transferred_at ? new Date(providerData.transferred_at) : new Date(), activePayoutKey: null, failureReason: null, reconciliationStatus: "matched" });
      } else if (failures.has(providerStatus)) {
        Object.assign(data, { status: providerStatus, activePayoutKey: null, failureReason: providerData?.reason || "Transfer failed", reconciliationStatus: "matched" });
        if (!row.fundsRestoredAt) {
          data.fundsRestoredAt = new Date();
          await tx.wallet.update({ where: { id: row.walletId }, data: { balance: { increment: row.requestedAmount }, totalWithdrawn: { decrement: row.requestedAmount } } });
          await tx.walletTransaction.create({ data: { walletId: row.walletId, type: "credit", amount: row.requestedAmount, transactionType: "refund", description: `Withdrawal ${providerStatus} — Ref: ${reference}. Funds restored.`, metadata: { source: "postgres_transfer_reconciliation", payoutReference: reference } } });
        }
      } else if (inFlight.has(providerStatus)) {
        if (["completed", "failed", "reversed"].includes(before)) { outcome = "status_mismatch"; data.reconciliationStatus = "status_mismatch"; }
        else Object.assign(data, { status: "processing", reconciliationStatus: "matched" });
      } else { outcome = "manual_review"; data.reconciliationStatus = "manual_review"; }
      data.reconciliationHistory = [...history, { source, localStatus: before, providerStatus, outcome, at: new Date().toISOString() }];
      const updated = await model.update({ where: { id: row.id }, data });
      return { found: true, type, withdrawal: payoutShape(updated), providerStatus, outcome };
    }, { isolationLevel: "Serializable" });
  },
  async updateOwnerPayoutDetails(type, tokenId, payoutDetails) {
    const model = ownerModelFor(type), id = await resolve(model, tokenId);
    if (!id) return null;
    return model.update({ where: { id }, data: { payoutDetails }, select: { id: true, legacyMongoId: true, payoutDetails: true } });
  },
  async getOwnerContext(type, tokenId) {
    const ownerModel = ownerModelFor(type);
    const ownerId = await resolve(ownerModel, tokenId);
    if (!ownerId) return null;
    const [owner, wallet] = await Promise.all([
      ownerModel.findUnique({ where: { id: ownerId }, select: type === "vendor"
        ? { id: true, legacyMongoId: true, name: true, storeName: true, payoutDetails: true, payoutFeeOverride: true }
        : { id: true, legacyMongoId: true, name: true, payoutDetails: true, payoutFeeOverride: true } }),
      prisma.wallet.findUnique({ where: { ownerId_ownerModel: { ownerId, ownerModel: type === "vendor" ? "Vendor" : "Rider" } } }),
    ]);
    return owner && wallet ? { owner, wallet } : null;
  },

  async reserveWithdrawal({ type, tokenId, requestedAmountNaira, transferFeeNaira, netAmountNaira, appliedMarkupNaira = 0, reference }) {
    const context = await this.getOwnerContext(type, tokenId);
    if (!context) return { error: "owner_or_wallet_not_found" };
    const requestedAmount = Math.round(Number(requestedAmountNaira) * 100);
    const transferFee = Math.round(Number(transferFeeNaira) * 100);
    const netAmount = Math.round(Number(netAmountNaira) * 100);
    const appliedMarkup = Math.round(Number(appliedMarkupNaira) * 100);
    const details = context.owner.payoutDetails && typeof context.owner.payoutDetails === "object" ? context.owner.payoutDetails : {};
    if (!details.payoutEnabled || !details.recipientCode) return { error: "payout_details_missing" };
    const ownerField = ownerFieldFor(type), model = modelFor(type);
    const lastCompleted = await model.findFirst({ where: { [ownerField]: context.owner.id, status: "completed", settledAt: { not: null } }, orderBy: { settledAt: "desc" } });
    if (lastCompleted?.settledAt) {
      const hours = (Date.now() - lastCompleted.settledAt.getTime()) / 3600000;
      if (hours < 24) return { error: "cooldown", hoursRemaining: Math.ceil(24 - hours) };
    }
    try {
      const row = await prisma.$transaction(async tx => {
        const debited = await tx.wallet.updateMany({ where: { id: context.wallet.id, balance: { gte: requestedAmount } }, data: { balance: { decrement: requestedAmount }, totalWithdrawn: { increment: requestedAmount } } });
        if (debited.count !== 1) throw Object.assign(new Error("insufficient_balance"), { code: "INSUFFICIENT_BALANCE" });
        const created = await modelFor(type, tx).create({ data: { [ownerField]: context.owner.id, walletId: context.wallet.id, requestedAmount, transferFee, netAmount, appliedMarkup, paystackReference: reference, recipientCode: details.recipientCode, bankName: details.bankName || "", accountNumber: details.accountNumber || "", accountName: details.accountName || "", activePayoutKey: activeKey(type, context.owner.id), walletDebitedAt: new Date() } });
        await tx.walletTransaction.create({ data: { walletId: context.wallet.id, type: "debit", amount: requestedAmount, transactionType: "withdrawal", description: `Withdrawal initiated — Ref: ${reference}`, metadata: { payoutReference: reference, source: "postgres_payout_reservation", withdrawalId: created.id } } });
        return created;
      }, { isolationLevel: "Serializable" });
      return { withdrawal: payoutShape(row), owner: context.owner };
    } catch (error) {
      if (error.code === "INSUFFICIENT_BALANCE") return { error: "insufficient_balance", balance: fromKobo(context.wallet.balance) };
      if (error.code === "P2002") return { error: "payout_in_progress" };
      throw error;
    }
  },

  async markProcessing(type, reference, { transferCode = null, providerStatus = null, uncertain = false } = {}) {
    const row = await modelFor(type).update({ where: { paystackReference: reference }, data: { status: "processing", paystackTransferCode: transferCode, providerStatus, ...(uncertain && { reconciliationStatus: "manual_review", failureReason: "Transfer submission outcome is unknown; funds remain reserved pending reconciliation" }) } });
    return payoutShape(row);
  },

  async claimPending(type, reference) {
    const model = modelFor(type);
    const found = await model.findUnique({ where: { paystackReference: reference } });
    if (!found || found.status !== "pending" || !found.walletDebitedAt) return null;
    const claimed = await model.updateMany({ where: { id: found.id, status: "pending" }, data: { status: "processing" } });
    if (claimed.count !== 1) return null;
    return payoutShape(await model.findUnique({ where: { id: found.id } }));
  },

  async reserveRetry(type, originalTokenId, reference) {
    const model = modelFor(type);
    const originalId = await resolve(model, originalTokenId);
    if (!originalId) return { error: "not_found" };
    try {
      const row = await prisma.$transaction(async tx => {
        const original = await modelFor(type, tx).findUnique({ where: { id: originalId } });
        if (!original || !["failed", "reversed"].includes(original.status) || !original.fundsRestoredAt) {
          throw Object.assign(new Error("not_retryable"), { code: "NOT_RETRYABLE" });
        }
        const debited = await tx.wallet.updateMany({ where: { id: original.walletId, balance: { gte: original.requestedAmount } }, data: { balance: { decrement: original.requestedAmount }, totalWithdrawn: { increment: original.requestedAmount } } });
        if (debited.count !== 1) throw Object.assign(new Error("insufficient_balance"), { code: "INSUFFICIENT_BALANCE" });
        const ownerField = ownerFieldFor(type);
        const retry = await modelFor(type, tx).create({ data: {
          [ownerField]: original[ownerField], walletId: original.walletId,
          requestedAmount: original.requestedAmount, transferFee: original.transferFee,
          netAmount: original.netAmount, appliedMarkup: original.appliedMarkup,
          status: "pending", paystackReference: reference,
          recipientCode: original.recipientCode, bankName: original.bankName,
          accountNumber: original.accountNumber, accountName: original.accountName,
          retryOfId: original.id, activePayoutKey: activeKey(type, original[ownerField]),
          walletDebitedAt: new Date(),
        } });
        await tx.walletTransaction.create({ data: { walletId: original.walletId, type: "debit", amount: original.requestedAmount, transactionType: "withdrawal", description: `Withdrawal retry initiated — Ref: ${reference}`, metadata: { payoutReference: reference, retryOfId: original.id, source: "postgres_payout_retry" } } });
        return retry;
      }, { isolationLevel: "Serializable" });
      return { withdrawal: payoutShape(row) };
    } catch (error) {
      if (error.code === "NOT_RETRYABLE") return { error: "not_retryable" };
      if (error.code === "INSUFFICIENT_BALANCE") return { error: "insufficient_balance" };
      if (error.code === "P2002") return { error: "retry_exists_or_payout_in_progress" };
      throw error;
    }
  },

  async restoreFailed(type, reference, reason, providerStatus = "failed") {
    const ownerField = ownerFieldFor(type);
    const row = await prisma.$transaction(async tx => {
      const model = modelFor(type, tx);
      const found = await model.findUnique({ where: { paystackReference: reference } });
      if (!found) return null;
      if (found.fundsRestoredAt) return found;
      const restoredAt = new Date();
      const claimed = await model.updateMany({ where: { id: found.id, fundsRestoredAt: null }, data: { status: providerStatus === "reversed" ? "reversed" : "failed", failureReason: reason, providerStatus, fundsRestoredAt: restoredAt, activePayoutKey: null, reconciliationStatus: "matched" } });
      if (claimed.count !== 1) return model.findUnique({ where: { id: found.id } });
      await tx.wallet.update({ where: { id: found.walletId }, data: { balance: { increment: found.requestedAmount }, totalWithdrawn: { decrement: found.requestedAmount } } });
      await tx.walletTransaction.create({ data: { walletId: found.walletId, type: "credit", amount: found.requestedAmount, transactionType: "refund", description: `Withdrawal ${providerStatus} — Ref: ${reference}. Funds restored.`, metadata: { payoutReference: reference, source: "postgres_payout_restoration", [ownerField]: found[ownerField] } } });
      return model.findUnique({ where: { id: found.id } });
    }, { isolationLevel: "Serializable" });
    return payoutShape(row);
  },

  async markCompleted(type, reference, provider = {}) {
    const row = await modelFor(type).update({ where: { paystackReference: reference }, data: { status: "completed", settledAt: provider.transferredAt || new Date(), providerTransferredAt: provider.transferredAt || new Date(), providerStatus: provider.status || "success", failureReason: null, activePayoutKey: null, reconciliationStatus: "matched", lastVerifiedAt: new Date(), lastProviderPayload: provider.payload || undefined } });
    return payoutShape(row);
  },
};
