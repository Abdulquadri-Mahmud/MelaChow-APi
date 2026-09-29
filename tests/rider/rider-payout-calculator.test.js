import {
  calculateRiderPayoutKobo,
  calculateRiderPayoutNaira,
  normalizeRiderPayoutConfig,
} from "../../services/postgres/riderPayout.js";

describe("rider payout calculator", () => {
  it("calculates a flat naira payout against a kobo delivery fee", () => {
    expect(calculateRiderPayoutKobo(100_000, { riderPayoutType: "flat", riderPayoutValue: 600 })).toBe(60_000);
    expect(calculateRiderPayoutNaira(100_000, { riderPayoutType: "flat", riderPayoutValue: 600 })).toBe(600);
  });

  it("calculates a percentage of the collected delivery fee", () => {
    expect(calculateRiderPayoutKobo(100_000, { riderPayoutType: "percentage", riderPayoutValue: 80 })).toBe(80_000);
    expect(calculateRiderPayoutNaira(100_000, { riderPayoutType: "percentage", riderPayoutValue: 80 })).toBe(800);
  });

  it("caps flat payouts at the fee actually collected", () => {
    expect(calculateRiderPayoutKobo(50_000, { riderPayoutType: "flat", riderPayoutValue: 800 })).toBe(50_000);
  });

  it("does not create earnings when no delivery fee was collected", () => {
    expect(calculateRiderPayoutKobo(0, { riderPayoutType: "flat", riderPayoutValue: 800 })).toBe(0);
  });

  it("supports legacy riderFixedPayout config and clamps percentages", () => {
    expect(calculateRiderPayoutKobo(100_000, { riderFixedPayout: 700 })).toBe(70_000);
    expect(normalizeRiderPayoutConfig({ riderPayoutType: "percentage", riderPayoutValue: 120 }).riderPayoutValue).toBe(100);
  });
});
