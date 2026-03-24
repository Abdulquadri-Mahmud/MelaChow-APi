import mongoose from 'mongoose';
import Order from '../model/order/Order.js';
import VendorOrder from '../model/vendor/VendorOrder.js';
import Wallet from '../model/wallet/wallet.mode.js';
import Refund from '../model/refund.model.js';
import logger from '../config/logger.js';

const COMMISSION_RETENTION_STATUSES = [
    'accepted', 'preparing', 'ready_for_pickup',
    'rider_assigned', 'out_for_delivery',
];

const PLATFORM_COMMISSION_RATE = 0.10;

/**
 * Refund a cancelled order to the customer's GrubDash wallet.
 * Idempotent — safe to call multiple times for the same orderId.
 */
export const refundOrderToWallet = async (orderId, reason) => {
    // Idempotency check before opening session
    const existingRefund = await Refund.findOne({ orderId });
    if (existingRefund) {
        logger.info({ orderId, refundId: existingRefund._id }, '⚡ Refund already processed — skipping');
        return existingRefund;
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new Error(`Order ${orderId} not found`);

        // Only refund paid orders
        if (order.paymentStatus !== 'paid') {
            logger.info({ orderId, paymentStatus: order.paymentStatus }, '⏭️ Order not paid — no refund needed');
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
        }, '💰 Processing refund');

        // Debit admin wallet
        const adminWallet = await Wallet.findOne({ ownerModel: 'Admin' }).session(session);
        if (!adminWallet) throw new Error('Admin wallet not found');
        if (adminWallet.balance < refundAmount) {
            throw new Error(`Admin wallet insufficient: has ₦${adminWallet.balance}, needs ₦${refundAmount}`);
        }

        adminWallet.balance = Number((adminWallet.balance - refundAmount).toFixed(2));
        adminWallet.transactions.push({
            type: 'debit',
            amount: refundAmount,
            description: `Refund to customer for Order ${order.orderId} — ${reason}`,
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

        // Update order status
        order.paymentStatus = 'refunded';
        order.orderStatus = 'cancelled';
        order.statusLog.push({
            status: 'cancelled',
            changedBy: 'system',
            timestamp: new Date(),
        });
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
                status: 'completed',
                notes: retainCommission
                    ? `Commission retained ₦${commissionRetained} — order was ${orderStatusAtCancellation}`
                    : 'Full refund — order was pending at cancellation',
            }],
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        logger.info({
            orderId, refundId: refund._id, refundAmount, userId: order.userId,
        }, '✅ Refund completed — customer wallet credited');

        return refund;

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        session.endSession();
        logger.error({ orderId, reason, error: error.message }, '❌ Refund failed');
        throw error;
    }
};
