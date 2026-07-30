import mongoose from "mongoose";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Wallet from "../model/wallet/wallet.mode.js";
import SupportTicket from "../model/supportTicket.model.js";
import SupportRefundSettlement from "../model/supportRefundSettlement.model.js";

const round = (amount) => Number(Number(amount || 0).toFixed(2));

async function getWallet(ownerId, ownerModel, session) {
  let wallet = await Wallet.findOne({ ownerId, ownerModel }).session(session);
  if (!wallet) {
    [wallet] = await Wallet.create([{ ownerId, ownerModel, balance: 0, transactions: [] }], { session });
  }
  return wallet;
}

/**
 * Credits the customer wallet and records the recoverable liability against the
 * responsible party. It is deliberately ticket-idempotent and must only be
 * called by an authorised admin decision.
 */
export async function settleSupportRefund({ ticketId, refundAmount, liabilities, reason, evidenceSummary, admin }) {
  const existing = await SupportRefundSettlement.findOne({ ticketId });
  if (existing) return existing;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ticket = await SupportTicket.findById(ticketId).session(session);
    if (!ticket?.order) throw new Error("This support ticket must be linked to an order before a refund can be approved.");
    const order = await Order.findById(ticket.order).session(session);
    if (!order || String(order.userId) !== String(ticket.userId)) throw new Error("Order ownership could not be verified.");
    if (order.paymentStatus !== "paid") throw new Error("Only paid orders can receive a wallet refund.");

    const amount = round(refundAmount);
    if (amount <= 0 || amount > round(order.total)) throw new Error("Refund amount must be greater than zero and cannot exceed the order total.");
    const totalLiability = round(liabilities.reduce((sum, item) => sum + Number(item.amount || 0), 0));
    if (totalLiability !== amount) throw new Error("Liability split must equal the customer refund amount.");

    const adminWallet = await Wallet.findOne({ ownerModel: "Admin" }).session(session);
    if (!adminWallet) throw new Error("Platform wallet not found.");
    const customerWallet = await getWallet(order.userId, "User", session);
    const vendorOrders = await VendorOrder.find({ userOrderId: order._id }).session(session);
    const settlementLiabilities = [];

    for (const input of liabilities) {
      const share = round(input.amount);
      if (share <= 0) continue;
      let recoveredAmount = 0;
      let recoverySource = "platform";
      let partyId = input.partyId || null;

      if (input.party === "vendor") {
        const vendorOrder = vendorOrders.find((entry) => String(entry.restaurantId) === String(partyId)) || vendorOrders[0];
        if (!vendorOrder) throw new Error("Vendor liability requires an order restaurant.");
        partyId = vendorOrder.restaurantId;
        const escrowAvailable = vendorOrder.escrowReleased ? 0 : round(vendorOrder.escrowAmount);
        const fromEscrow = Math.min(share, escrowAvailable);
        if (fromEscrow) {
          vendorOrder.escrowAmount = round(vendorOrder.escrowAmount - fromEscrow);
          await vendorOrder.save({ session });
          recoveredAmount += fromEscrow;
          recoverySource = "escrow";
        }
        const remaining = round(share - recoveredAmount);
        if (remaining) {
          const wallet = await getWallet(partyId, "Vendor", session);
          wallet.balance = round(wallet.balance - remaining);
          wallet.transactions.push({ type: "debit", amount: remaining, transactionType: "manual_debit", description: "Support refund liability for order " + order.orderId, orderId: order._id });
          await wallet.save({ session });
          recoveredAmount += remaining;
          recoverySource = "wallet";
        }
      } else if (input.party === "rider") {
        partyId = partyId || order.riderId;
        if (!partyId) throw new Error("Rider liability requires an assigned rider.");
        const wallet = await getWallet(partyId, "Rider", session);
        wallet.balance = round(wallet.balance - share);
        wallet.transactions.push({ type: "debit", amount: share, transactionType: "manual_debit", description: "Support refund liability for order " + order.orderId, orderId: order._id });
        await wallet.save({ session });
        recoveredAmount = share;
        recoverySource = "wallet";
      }
      settlementLiabilities.push({ party: input.party, partyId, amount: share, recoverySource, recoveredAmount, outstandingAmount: 0 });
    }

    adminWallet.balance = round(adminWallet.balance - amount);
    adminWallet.transactions.push({ type: "debit", amount, transactionType: "refund", description: "Customer wallet refund for support ticket " + ticket.ticketNumber, orderId: order._id });
    await adminWallet.save({ session });
    customerWallet.balance = round(customerWallet.balance + amount);
    customerWallet.transactions.push({ type: "credit", amount, transactionType: "refund", description: "Support refund for order " + order.orderId, orderId: order._id });
    await customerWallet.save({ session });

    const [settlement] = await SupportRefundSettlement.create([{
      ticketId: ticket._id, orderId: order._id, customerId: order.userId, refundAmount: amount,
      decision: settlementLiabilities.length > 1 ? "shared" : settlementLiabilities[0]?.party || "platform",
      liabilities: settlementLiabilities, reason, evidenceSummary,
      approvedBy: admin._id, approvedByName: admin.name || admin.email || "Admin",
    }], { session });
    ticket.status = "resolved";
    ticket.resolvedAt = new Date();
    ticket.timeline.push({ action: "wallet_refund_approved", to: "resolved", note: "Wallet refund approved: ₦" + amount, actorRole: "admin", actorId: admin._id });
    await ticket.save({ session });
    await session.commitTransaction();
    return settlement;
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally { session.endSession(); }
}
