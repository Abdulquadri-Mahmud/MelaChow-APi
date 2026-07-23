import mongoose from "mongoose";
import axios from "axios";
import { jest } from "@jest/globals";
import Withdrawal from "../../model/wallet/Withdrawal.model.js";
import RiderWithdrawal from "../../model/wallet/RiderWithdrawal.model.js";
import Wallet from "../../model/wallet/wallet.mode.js";
import Vendor from "../../model/vendor/vendor.model.js";
import Rider from "../../model/rider.model.js";
import {
    getAdminWithdrawals,
    approvePendingWithdrawal,
    retryWithdrawal,
    forceFailWithdrawal
} from "../../controller/wallet/withdrawal.controller.js";
import { applyTransferOutcome } from "../../services/transferReconciliation.service.js";

describe("Admin Payout & Withdrawal Oversight Controller", () => {
    let mockRes, mockReq;
    let vendorId, riderId, vendorWalletId, riderWalletId;

    beforeEach(async () => {
        // Setup mock response
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };

        // Create mock vendor, rider and wallets
        vendorId = new mongoose.Types.ObjectId();
        riderId = new mongoose.Types.ObjectId();
        vendorWalletId = new mongoose.Types.ObjectId();
        riderWalletId = new mongoose.Types.ObjectId();

        await Vendor.create({
            _id: vendorId,
            name: "Merchant Owner",
            storeName: "Test Merchant",
            email: "merchant@test.com",
            phone: "08011112222",
            password: "password123",
            cuisineTypes: ["Rice"],
            payoutDetails: {
                payoutEnabled: true,
                recipientCode: "RCP_vendor123",
                bankName: "Access Bank",
                accountNumber: "0123456789",
                accountName: "Test Merchant Account"
            }
        });

        await Rider.create({
            _id: riderId,
            name: "Test Rider",
            email: "rider@test.com",
            phone: "08033334444",
            password: "password123",
            city: new mongoose.Types.ObjectId(),
            state: new mongoose.Types.ObjectId(),
            vehicleType: "bicycle",
            payoutDetails: {
                payoutEnabled: true,
                recipientCode: "RCP_rider123",
                bankName: "GTBank",
                accountNumber: "9876543210",
                accountName: "Test Rider Account"
            }
        });

        await Wallet.create({
            _id: vendorWalletId,
            ownerId: vendorId,
            ownerModel: "Vendor",
            balance: 5000,
            transactions: []
        });

        await Wallet.create({
            _id: riderWalletId,
            ownerId: riderId,
            ownerModel: "Rider",
            balance: 3000,
            transactions: []
        });

        jest.clearAllMocks();
    });

    afterEach(() => jest.restoreAllMocks());

    describe("getAdminWithdrawals", () => {
        it("should return combined and paginated withdrawals", async () => {
            // Create some withdrawals
            await Withdrawal.create({
                vendorId,
                walletId: vendorWalletId,
                requestedAmount: 1000,
                transferFee: 100,
                netAmount: 900,
                status: "completed",
                paystackReference: "WD_V1",
                recipientCode: "RCP_vendor123",
                bankName: "Access Bank",
                accountNumber: "0123456789",
                accountName: "Test Merchant Account",
                createdAt: new Date("2026-06-25T01:00:00Z")
            });

            await RiderWithdrawal.create({
                riderId,
                walletId: riderWalletId,
                requestedAmount: 2000,
                transferFee: 0,
                netAmount: 2000,
                status: "failed",
                paystackReference: "WD_R1",
                recipientCode: "RCP_rider123",
                bankName: "GTBank",
                accountNumber: "9876543210",
                accountName: "Test Rider Account",
                createdAt: new Date("2026-06-25T02:00:00Z")
            });

            mockReq = { query: { page: 1, limit: 10 } };
            await getAdminWithdrawals(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalled();
            const data = mockRes.json.mock.calls[0][0];
            expect(data.success).toBe(true);
            expect(data.withdrawals).toHaveLength(2);
            // Sort validation (most recent first)
            expect(data.withdrawals[0].paystackReference).toBe("WD_R1");
            expect(data.withdrawals[0].withdrawalType).toBe("rider");
            expect(data.withdrawals[1].paystackReference).toBe("WD_V1");
            expect(data.withdrawals[1].withdrawalType).toBe("vendor");
        });

        it("should filter by type vendor or rider", async () => {
            await Withdrawal.create({
                vendorId,
                walletId: vendorWalletId,
                requestedAmount: 1000,
                transferFee: 100,
                netAmount: 900,
                status: "completed",
                paystackReference: "WD_V1",
                recipientCode: "RCP_vendor123"
            });

            await RiderWithdrawal.create({
                riderId,
                walletId: riderWalletId,
                requestedAmount: 2000,
                transferFee: 0,
                netAmount: 2000,
                status: "failed",
                paystackReference: "WD_R1",
                recipientCode: "RCP_rider123"
            });

            mockReq = { query: { type: "vendor" } };
            await getAdminWithdrawals(mockReq, mockRes);
            let data = mockRes.json.mock.calls[0][0];
            expect(data.withdrawals).toHaveLength(1);
            expect(data.withdrawals[0].withdrawalType).toBe("vendor");

            mockReq = { query: { type: "rider" } };
            await getAdminWithdrawals(mockReq, mockRes);
            data = mockRes.json.mock.calls[1][0];
            expect(data.withdrawals).toHaveLength(1);
            expect(data.withdrawals[0].withdrawalType).toBe("rider");
        });

        it("should filter by status", async () => {
            await Withdrawal.create({
                vendorId,
                walletId: vendorWalletId,
                requestedAmount: 1000,
                transferFee: 100,
                netAmount: 900,
                status: "completed",
                paystackReference: "WD_V1",
                recipientCode: "RCP_vendor123"
            });

            await RiderWithdrawal.create({
                riderId,
                walletId: riderWalletId,
                requestedAmount: 2000,
                transferFee: 0,
                netAmount: 2000,
                status: "failed",
                paystackReference: "WD_R1",
                recipientCode: "RCP_rider123"
            });

            mockReq = { query: { status: "completed" } };
            await getAdminWithdrawals(mockReq, mockRes);
            const data = mockRes.json.mock.calls[0][0];
            expect(data.withdrawals).toHaveLength(1);
            expect(data.withdrawals[0].status).toBe("completed");
        });
    });

    describe("approvePendingWithdrawal", () => {
        it("should call Paystack API and transition status to processing", async () => {
            const wd = await Withdrawal.create({
                vendorId,
                walletId: vendorWalletId,
                requestedAmount: 1000,
                transferFee: 100,
                netAmount: 900,
                status: "pending",
                paystackReference: "WD_PENDING_V1",
                recipientCode: "RCP_vendor123",
                accountName: "Test Merchant Account"
            });

            await Wallet.findByIdAndUpdate(vendorWalletId, {
                $inc: { balance: -1000, totalWithdrawn: 1000 },
                $push: { transactions: {
                    type: "debit",
                    amount: 1000,
                    description: "Withdrawal initiated — Ref: WD_PENDING_V1",
                    transactionType: "withdrawal",
                } },
            });

            jest.spyOn(axios, "post").mockResolvedValue({
                data: {
                    status: true,
                    message: "Transfer queued",
                    data: { transfer_code: "TRF_mock123" }
                }
            });

            mockReq = { params: { id: wd._id } };
            await approvePendingWithdrawal(mockReq, mockRes);

            expect(axios.post).toHaveBeenCalledWith(
                "https://api.paystack.co/transfer",
                expect.any(Object),
                expect.any(Object)
            );
            expect(mockRes.json).toHaveBeenCalled();
            const response = mockRes.json.mock.calls[0][0];
            expect(response.success).toBe(true);
            expect(response.withdrawal.status).toBe("processing");
            expect(response.withdrawal.paystackTransferCode).toBe("TRF_mock123");
        });

        it("should rollback wallet balance and set status to failed if Paystack API fails", async () => {
            const wd = await Withdrawal.create({
                vendorId,
                walletId: vendorWalletId,
                requestedAmount: 1000,
                transferFee: 100,
                netAmount: 900,
                status: "pending",
                paystackReference: "WD_PENDING_FAIL",
                recipientCode: "RCP_vendor123",
                accountName: "Test Merchant Account"
            });

            // Simulate wallet having transaction that will be removed
            const wallet = await Wallet.findById(vendorWalletId);
            wallet.balance = 4000; // was 5000, debited 1000
            wallet.transactions.push({
                type: "debit",
                amount: 1000,
                description: "Withdrawal initiated — Ref: WD_PENDING_FAIL"
            });
            await wallet.save();

            jest.spyOn(axios, "post").mockRejectedValue({
                response: {
                    data: { message: "Insufficient transfer balance" }
                }
            });

            mockReq = { params: { id: wd._id } };
            await approvePendingWithdrawal(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(502);
            const updatedWd = await Withdrawal.findById(wd._id);
            expect(updatedWd.status).toBe("failed");
            expect(updatedWd.failureReason).toBe("Insufficient transfer balance");

            const updatedWallet = await Wallet.findById(vendorWalletId);
            expect(updatedWallet.balance).toBe(5000); // restored
            expect(updatedWallet.transactions).toHaveLength(0); // removed
        });
    });

    describe("retryWithdrawal", () => {
        it("should debit wallet and retry successfully", async () => {
            const wd = await RiderWithdrawal.create({
                riderId,
                walletId: riderWalletId,
                requestedAmount: 1000,
                transferFee: 0,
                netAmount: 1000,
                status: "failed",
                fundsRestoredAt: new Date(),
                paystackReference: "WD_OLD_REF",
                recipientCode: "RCP_rider123",
                accountName: "Test Rider Account"
            });

            jest.spyOn(axios, "request")
              .mockResolvedValueOnce({ data: { data: { status: "failed", amount: 100000, reference: "WD_OLD_REF" } } })
              .mockResolvedValueOnce({
                data: {
                    status: true,
                    message: "Transfer queued",
                    data: { transfer_code: "TRF_retry123" }
                }
              });

            mockReq = { params: { id: wd._id } };
            await retryWithdrawal(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalled();
            const response = mockRes.json.mock.calls[0][0];
            expect(response.success).toBe(true);
            expect(response.withdrawal.status).toBe("processing");
            expect(response.withdrawal.paystackReference).not.toBe("WD_OLD_REF"); // new reference generated
            expect(response.withdrawal.paystackReference).toContain("WD_RETRY_");

            const updatedWallet = await Wallet.findById(riderWalletId);
            expect(updatedWallet.balance).toBe(2000); // 3000 - 1000 = 2000
            expect(updatedWallet.transactions).toHaveLength(1);
            expect(updatedWallet.transactions[0].type).toBe("debit");
        });

        it("should rollback debit if retry API call fails", async () => {
            const wd = await RiderWithdrawal.create({
                riderId,
                walletId: riderWalletId,
                requestedAmount: 1000,
                transferFee: 0,
                netAmount: 1000,
                status: "failed",
                fundsRestoredAt: new Date(),
                paystackReference: "WD_OLD_REF",
                recipientCode: "RCP_rider123",
                accountName: "Test Rider Account"
            });

            jest.spyOn(axios, "request")
              .mockResolvedValueOnce({ data: { data: { status: "failed", amount: 100000, reference: "WD_OLD_REF" } } })
              .mockRejectedValueOnce({ response: { status: 400, data: { message: "Account number resolved failed" } } });

            mockReq = { params: { id: wd._id } };
            await retryWithdrawal(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(502);

            const updatedWd = await RiderWithdrawal.findById(wd._id);
            expect(updatedWd.status).toBe("failed");
            const retry = await RiderWithdrawal.findOne({ retryOf: wd._id });
            expect(retry.status).toBe("failed");
            expect(retry.failureReason).toBe("Account number resolved failed");

            const updatedWallet = await Wallet.findById(riderWalletId);
            expect(updatedWallet.balance).toBe(3000); // remained 3000 due to rollback
            expect(updatedWallet.transactions.filter((item) => item.type === "debit")).toHaveLength(1);
            expect(updatedWallet.transactions.filter((item) => item.type === "credit")).toHaveLength(1);
        });
    });

    describe("forceFailWithdrawal", () => {
        it("restores a failed transfer only once when Paystack delivers duplicates", async () => {
            const wd = await Withdrawal.create({
                vendorId,
                walletId: vendorWalletId,
                requestedAmount: 1000,
                transferFee: 100,
                netAmount: 900,
                status: "processing",
                paystackReference: "WD_DUPLICATE_EVENT",
                recipientCode: "RCP_vendor123",
                activePayoutKey: `vendor:${vendorId}`,
            });
            await Wallet.findByIdAndUpdate(vendorWalletId, { balance: 4000, totalWithdrawn: 1000 });

            const payload = { status: "failed", amount: 90000, reference: wd.paystackReference, reason: "Bank rejected transfer" };
            await applyTransferOutcome({ reference: wd.paystackReference, providerData: payload, source: "test" });
            await applyTransferOutcome({ reference: wd.paystackReference, providerData: payload, source: "test_duplicate" });

            const wallet = await Wallet.findById(vendorWalletId);
            const updated = await Withdrawal.findById(wd._id);
            expect(wallet.balance).toBe(5000);
            expect(wallet.transactions.filter((item) => item.type === "credit")).toHaveLength(1);
            expect(updated.fundsRestoredAt).not.toBeNull();
            expect(updated.activePayoutKey).toBeUndefined();
        });

        it("should force fail a processing vendor withdrawal and refund the balance", async () => {
            const wd = await Withdrawal.create({
                vendorId,
                walletId: vendorWalletId,
                requestedAmount: 1000,
                transferFee: 100,
                netAmount: 900,
                status: "processing",
                paystackReference: "WD_PROCESSING_V1",
                recipientCode: "RCP_vendor123",
                accountName: "Test Merchant Account"
            });

            // Set wallet balance as if it was debited
            const wallet = await Wallet.findById(vendorWalletId);
            wallet.balance = 4000;
            wallet.totalWithdrawn = 1000;
            await wallet.save();

            mockReq = { params: { withdrawalId: wd._id } };
            jest.spyOn(axios, "request").mockResolvedValueOnce({
                data: { data: { status: "failed", amount: 90000, reference: "WD_PROCESSING_V1", reason: "Admin override — stuck withdrawal" } }
            });
            await forceFailWithdrawal(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalled();

            const updatedWd = await Withdrawal.findById(wd._id);
            expect(updatedWd.status).toBe("failed");
            expect(updatedWd.failureReason).toBe("Admin override — stuck withdrawal");

            const updatedWallet = await Wallet.findById(vendorWalletId);
            expect(updatedWallet.balance).toBe(5000); // refunded
            expect(updatedWallet.totalWithdrawn).toBe(0);
            expect(updatedWallet.transactions).toHaveLength(1);
            expect(updatedWallet.transactions[0].type).toBe("credit");
            expect(updatedWallet.transactions[0].transactionType).toBe("refund");
        });

        it("should force fail a pending rider withdrawal and refund the balance", async () => {
            const wd = await RiderWithdrawal.create({
                riderId,
                walletId: riderWalletId,
                requestedAmount: 1500,
                transferFee: 0,
                netAmount: 1500,
                status: "pending",
                paystackReference: "WD_PENDING_R1",
                recipientCode: "RCP_rider123",
                accountName: "Test Rider Account"
            });

            // Set wallet balance as if it was debited
            const wallet = await Wallet.findById(riderWalletId);
            wallet.balance = 1500;
            wallet.totalWithdrawn = 1500;
            await wallet.save();

            mockReq = { params: { withdrawalId: wd._id } };
            jest.spyOn(axios, "request").mockResolvedValueOnce({
                data: { data: { status: "failed", amount: 150000, reference: "WD_PENDING_R1", reason: "Admin override — stuck withdrawal" } }
            });
            await forceFailWithdrawal(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalled();

            const updatedWd = await RiderWithdrawal.findById(wd._id);
            expect(updatedWd.status).toBe("failed");
            expect(updatedWd.failureReason).toBe("Admin override — stuck withdrawal");

            const updatedWallet = await Wallet.findById(riderWalletId);
            expect(updatedWallet.balance).toBe(3000); // refunded
            expect(updatedWallet.totalWithdrawn).toBe(0);
            expect(updatedWallet.transactions).toHaveLength(1);
            expect(updatedWallet.transactions[0].type).toBe("credit");
            expect(updatedWallet.transactions[0].transactionType).toBe("refund");
        });
    });
});
