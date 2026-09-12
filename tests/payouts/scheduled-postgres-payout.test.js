import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("scheduled PostgreSQL payouts", () => {
  it("uses PostgreSQL wallets and the atomic payout reservation when enabled", async () => {
    const job = await source("../../jobs/scheduledPayout.job.js");
    expect(job).toContain("if (usePostgresPayoutWrites())");
    expect(job).toContain("prisma.wallet.findMany");
    expect(job).toContain("payoutRepository.reserveWithdrawal");
    expect(job).toContain("payoutRepository.restoreFailed");
  });

  it("sends Paystack integer kobo for automatic payouts", async () => {
    const job = await source("../../jobs/scheduledPayout.job.js");
    expect(job).toContain("const amountKobo = Math.round(payoutCalc.net * 100)");
    expect(job).toMatch(/initiatePaystackTransfer\(\{[\s\S]*?amountKobo,/);
  });

  it("converts naira thresholds to kobo before querying PostgreSQL", async () => {
    const job = await source("../../jobs/scheduledPayout.job.js");
    expect(job).toContain("Math.round(VENDOR_PAYOUT_THRESHOLD * 100)");
    expect(job).toContain("Math.round(RIDER_PAYOUT_THRESHOLD * 100)");
  });
});
