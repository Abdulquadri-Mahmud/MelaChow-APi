import mongoose from 'mongoose';
import Order from '../model/order/Order.js';
import VendorOrder from '../model/vendor/VendorOrder.js';
import Wallet from '../model/wallet/wallet.mode.js';
import Refund from '../model/refund.model.js';
import logger from '../config/logger.js';
import { restoreOptionStockForOrder, restorePortionStockForOrder } from './optionStock.service.js';

const COMMISSION_RETENTION_STATUSES = [
    'accepted', 'preparing', 'ready_for_pickup',
    'rider_assigned', 'out_for_delivery',
];

// Commission is currently 0 — platform revenue comes from delivery spread only.
// When commission is introduced, update this rate and the corresponding
// PLATFORM_COMMISSION constant in createOrderV2.controller.js together.
const PLATFORM_COMMISSION_RATE = 0;

/**
 * Refund a cancelled order to the customer's MelaChow wallet.
 * Idempotent â€” safe to call multiple times for the same orderId.
 */
export const refundOrderToWallet = async (orderId, reason) => {
    // Idempotency check before opening session
    const existingRefund = await Refund.findOne({ orderId });
    if (existingRefund) {
        logger.info({ orderId, refundId: existingRefund._id }, 'Refund already processed - skipping');
        return existingRefund;
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new Error(`Order ${orderId} not found`);

        // Only refund paid orders
        if (order.paymentStatus !== 'paid') {
            logger.info({ orderId, paymentStatus: order.paymentStatus }, 'Order not paid - no refund needed');
            await session.abortTransaction();
            session.endSession();
            return null;
        }

        // Calculate refund amount
        const orderStatusAtCancellation = order.orderStatus;
        const retainCommission = COMMISSION_RETENTION_STATUSES.includes(orderStatusAtCancellation);
        const commissionRetained = retainCommission
            ? Number((order.subtotal * PLATFORM_COMMISSION_RATE).toFixed(2))
            : 0;
        const refundAmount = Number((order.total - commissionRetained).toFixed(2));

        logger.info({
            orderId, orderStatusAtCancellation,
            total: order.total, commissionRetained, refundAmount, reason,
        }, 'Processing refund');

        // Attempt wallet credit — non-fatal if admin wallet is insufficient.
        // Order cancellation proceeds regardless. Shortfall logged for manual top-up.
        let walletCreditSucceeded = false;

        const adminWallet = await Wallet.findOne({ ownerModel: 'Admin' }).session(session);
        if (!adminWallet) throw new Error('Admin wallet not found');

        if (adminWallet.balance < refundAmount) {
            // Log shortfall — order will still be cancelled and audit doc created
            logger.error({
                orderId: order.orderId,
                adminBalance: adminWallet.balance,
                refundAmount,
                reason,
            }, '⚠️ Admin wallet insufficient for refund — order cancelled, wallet credit pending manual resolution');
        } else {
            // Debit admin wallet
            adminWallet.balance = Number((adminWallet.balance - refundAmount).toFixed(2));
            adminWallet.transactions.push({
                type: 'debit',
                amount: refundAmount,
                description: `Refund to customer for Order ${order.orderId} - ${reason}`,
                orderId: order._id,
                transactionType: 'refund',
            });
            await adminWallet.save({ session });

            // Credit customer wallet
            let userWallet = await Wallet.findOne({
                ownerId: order.userId,
                ownerModel: 'User',
            }).session(session);

            if (!userWallet) {
                [userWallet] = await Wallet.create(
                    [{ ownerId: order.userId, ownerModel: 'User', balance: 0, transactions: [] }],
                    { session }
                );
            }

            userWallet.balance = Number((userWallet.balance + refundAmount).toFixed(2));
            userWallet.transactions.push({
                type: 'credit',
                amount: refundAmount,
                description: `Refund for cancelled Order ${order.orderId}`,
                orderId: order._id,
                transactionType: 'refund',
            });
            await userWallet.save({ session });

            walletCreditSucceeded = true;
        }

        // Update order status
        order.paymentStatus = 'refunded';
        order.orderStatus = 'cancelled';
        order.statusLog.push({
            status: 'cancelled',
            changedBy: 'system',
            timestamp: new Date(),
        });
        await restoreOptionStockForOrder(order, session);
        await restorePortionStockForOrder(order, session);
        await order.save({ session });

        // Cancel all VendorOrders
        await VendorOrder.updateMany(
            { userOrderId: order._id, orderStatus: { $nin: ['delivered', 'completed'] } },
            { orderStatus: 'cancelled' },
            { session }
        );

        // Create Refund audit document
        const [refund] = await Refund.create(
            [{
                orderId: order._id,
                userId: order.userId,
                amount: refundAmount,
                originalTotal: order.total,
                commissionRetained,
                reason,
                orderStatusAtCancellation,
                // 'pending_wallet' signals admin must manually credit customer wallet
                status: walletCreditSucceeded ? 'completed' : 'pending_wallet',
                notes: !walletCreditSucceeded
                    ? `Admin wallet insufficient — order cancelled but wallet credit pending. Customer owed ₦${refundAmount}. Manual resolution required.`
                    : retainCommission
                        ? `Commission retained ₦${commissionRetained} - order was ${orderStatusAtCancellation}`
                        : 'Full refund - order was pending at cancellation',
            }],
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        if (walletCreditSucceeded) {
            logger.info({
                orderId, refundId: refund._id, refundAmount, userId: order.userId,
            }, '✅ Refund completed — customer wallet credited');
        } else {
            logger.warn({
                orderId, refundId: refund._id, refundAmount, userId: order.userId,
            }, '⚠️ Order cancelled — refund audit created but wallet credit PENDING manual resolution');
        }

        return refund;

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        session.endSession();
        logger.error({ orderId, reason, error: error.message }, 'Refund failed');
        throw error;
    }
};

/** Refund one vendor's unaccepted part of a multi-vendor order without affecting accepted vendors. */
export const refundVendorOrderToWallet = async (orderId, vendorOrderId, reason = 'auto_cancel') => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const order = await Order.findById(orderId).session(session);
        const vendorOrder = await VendorOrder.findById(vendorOrderId).session(session);
        if (!order || !vendorOrder || vendorOrder.userOrderId.toString() !== order._id.toString()) throw new Error('Order segment not found');
        if (vendorOrder.orderStatus !== 'pending' || order.paymentStatus !== 'paid') { await session.abortTransaction(); return null; }

        const vendorFoodTotal = Number(vendorOrder.vendorTotal || vendorOrder.items.reduce((sum, item) => sum + Number(item.originalPrice || 0) * Number(item.quantity || 1), 0));
        const deliveryFee = Number((order.vendorDeliveryFees || []).find((fee) => String(fee.restaurantId) === String(vendorOrder.restaurantId))?.deliveryFee || 0);
        const discountShare = Number(order.appliedDiscount?.amount || 0) * (vendorFoodTotal / Math.max(1, Number(order.subtotal || 0)));
        const refundAmount = Number(Math.max(0, vendorFoodTotal + deliveryFee - discountShare).toFixed(2));
        const adminWallet = await Wallet.findOne({ ownerModel: 'Admin' }).session(session);
        if (!adminWallet || adminWallet.balance < refundAmount) throw new Error('Admin wallet cannot fund vendor timeout refund');
        let userWallet = await Wallet.findOne({ ownerId: order.userId, ownerModel: 'User' }).session(session);
        if (!userWallet) [userWallet] = await Wallet.create([{ ownerId: order.userId, ownerModel: 'User', balance: 0, transactions: [] }], { session });
        adminWallet.balance = Number((adminWallet.balance - refundAmount).toFixed(2));
        userWallet.balance = Number((userWallet.balance + refundAmount).toFixed(2));
        adminWallet.transactions.push({ type: 'debit', amount: refundAmount, description: `Partial refund for Order ${order.orderId} - ${reason}`, orderId: order._id, transactionType: 'refund' });
        userWallet.transactions.push({ type: 'credit', amount: refundAmount, description: `Refund for cancelled restaurant in Order ${order.orderId}`, orderId: order._id, transactionType: 'refund' });
        vendorOrder.orderStatus = 'cancelled';
        await Promise.all([adminWallet.save({ session }), userWallet.save({ session }), vendorOrder.save({ session })]);
        await session.commitTransaction();
        return { refundAmount, vendorOrder, order };
    } catch (error) { if (session.inTransaction()) await session.abortTransaction(); throw error; } finally { session.endSession(); }
};