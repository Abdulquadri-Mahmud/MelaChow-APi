import "dotenv/config";
import prisma from "../config/prisma.js";
import { payoutRepository } from "../services/postgres/payout.repository.js";

let reference;
try {
  const vendor = await prisma.vendor.findFirst({ where: { deletedAt: null }, select: { id: true, legacyMongoId: true, payoutDetails: true } });
  if (!vendor) throw new Error("No vendor available");
  let wallet = await prisma.wallet.findUnique({ where: { ownerId_ownerModel: { ownerId: vendor.id, ownerModel: "Vendor" } } });
  if (!wallet) wallet = await prisma.wallet.create({ data: { ownerId: vendor.id, ownerModel: "Vendor" } });
  const walletSnapshot = { balance: wallet.balance, totalWithdrawn: wallet.totalWithdrawn };
  const payoutSnapshot = vendor.payoutDetails;
  reference = `WD_SMOKE_${Date.now()}`;
  try {
    await prisma.vendor.update({ where: { id: vendor.id }, data: { payoutDetails: { bankName: "Local Test Bank", accountNumber: "0000000000", accountName: "Local Test Account", recipientCode: "local_recipient", payoutEnabled: true } } });
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: 50000 } } });
    const reserved = await payoutRepository.reserveWithdrawal({ type: "vendor", tokenId: vendor.legacyMongoId || vendor.id, requestedAmountNaira: 100, transferFeeNaira: 5, netAmountNaira: 95, reference });
    if (!reserved.withdrawal) throw new Error(`Reservation failed: ${reserved.error}`);
    await payoutRepository.markProcessing("vendor", reference, { transferCode: "local_smoke", providerStatus: "local_test" });
    const firstResult = await payoutRepository.applyProviderOutcome("vendor", reference, { status: "failed", amount: 9500, reason: "smoke rejection" }, "smoke");
    const secondResult = await payoutRepository.applyProviderOutcome("vendor", reference, { status: "failed", amount: 9500, reason: "smoke rejection repeat" }, "smoke_repeat");
    const first = firstResult.withdrawal, second = secondResult.withdrawal;
    const after = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    const credits = await prisma.walletTransaction.count({ where: { walletId: wallet.id, metadata: { path: ["payoutReference"], equals: reference }, type: "credit" } });
    if (!first.fundsRestoredAt || second.id !== first.id || after.balance !== walletSnapshot.balance + 50000 || credits !== 1) throw new Error("Exactly-once restoration verification failed");
    if (second.reconciliationAttempts !== first.reconciliationAttempts + 1) throw new Error("Reconciliation attempt/history was not recorded");
    console.log(JSON.stringify({ ok: true, reservationAtomic: true, reconciliationApplied: true, restorationIdempotent: true, restorationCredits: credits }, null, 2));
  } finally {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id, metadata: { path: ["payoutReference"], equals: reference } } });
    await prisma.withdrawal.deleteMany({ where: { paystackReference: reference } });
    await prisma.wallet.update({ where: { id: wallet.id }, data: walletSnapshot });
    await prisma.vendor.update({ where: { id: vendor.id }, data: { payoutDetails: payoutSnapshot || {} } });
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
