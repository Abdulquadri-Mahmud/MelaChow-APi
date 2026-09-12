import {
  calculateServiceFeeKobo,
  calculateVendorCommissionKobo,
} from "../../services/postgres/orderCreation.repository.js";

describe("PostgreSQL platform money calculations", () => {
  it("converts a fixed naira service fee to kobo", () => {
    expect(calculateServiceFeeKobo({ serviceFeeEnabled: true, serviceFeeType: "fixed", serviceFeeValue: 150 }, 130_000)).toBe(15_000);
  });

  it("calculates a percentage service fee from a kobo subtotal", () => {
    expect(calculateServiceFeeKobo({ serviceFeeEnabled: true, serviceFeeType: "percentage", serviceFeeValue: 10, serviceFeeCap: 500 }, 130_000)).toBe(13_000);
  });

  it("converts the percentage cap from naira to kobo", () => {
    expect(calculateServiceFeeKobo({ serviceFeeEnabled: true, serviceFeeType: "percentage", serviceFeeValue: 20, serviceFeeCap: 150 }, 130_000)).toBe(15_000);
  });

  it("calculates vendor commission as a percentage without currency conversion", () => {
    expect(calculateVendorCommissionKobo(130_000, { commissionEnabled: true, commissionRate: 10 })).toBe(13_000);
  });

  it("caps invalid commission rates and leaves the vendor remainder in kobo", () => {
    const subtotal = 130_000;
    const commission = calculateVendorCommissionKobo(subtotal, { commissionEnabled: true, commissionRate: 150 });
    expect(commission).toBe(subtotal);
    expect(subtotal - commission).toBe(0);
  });
});
