import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../../model/user.model.js';
import Vendor from '../../model/vendor/vendor.model.js';
import Order from '../../model/order/Order.js';
import VendorOrder from '../../model/vendor/VendorOrder.js';
import Wallet from '../../model/wallet/wallet.mode.js';
import Rider from '../../model/rider.model.js';
import Admin from '../../model/Admin/admin.model.js';

export const createTestUser = async (overrides = {}) => {
    const user = await User.create({
        firstname: 'Test',
        lastname: 'User',
        email: `test-${Date.now()}@grubdash.com`,
        password: await bcrypt.hash('password123', 10),
        isVerified: true,
        isActive: true,
        phone: '08012345678',
        ...overrides,
    });
    return user;
};

export const createTestVendor = async (overrides = {}) => {
    const vendor = await Vendor.create({
        storeName: 'Test Restaurant',
        email: `vendor-${Date.now()}@grubdash.com`,
        password: await bcrypt.hash('password123', 10),
        phone: '08098765432',
        isApproved: true,
        isActive: true,
        deliveryManagedBy: 'admin',
        address: { city: 'Lagos', state: 'Lagos' },
        ...overrides,
    });
    return vendor;
};

export const createTestAdmin = async (overrides = {}) => {
    const admin = await Admin.create({
        name: 'Test Admin',
        email: `admin-${Date.now()}@grubdash.com`,
        password: await bcrypt.hash('password123', 10),
        role: 'super-admin',
        ...overrides,
    });
    return admin;
};

export const createTestWallet = async (ownerId, ownerModel, balance = 0) => {
    return Wallet.create({ ownerId, ownerModel, balance, transactions: [] });
};

export const createTestOrder = async (userId, vendorId, overrides = {}) => {
    const orderId = `ORD-TEST${Date.now()}`;
    return Order.create({
        orderId,
        userId,
        items: [{
            type: 'item',
            foodId: new mongoose.Types.ObjectId(),
            restaurantId: vendorId,
            name: 'Test Jollof Rice',
            quantity: 1,
            price: 2500,
            storeName: 'Test Restaurant',
            portion_label: 'Large',
            portionId: new mongoose.Types.ObjectId(),
            selected_options: [],
        }],
        vendorDeliveryFees: [{ restaurantId: vendorId, deliveryFee: 500 }],
        deliveryAddress: {
            addressLine: '123 Test Street',
            city: 'Lagos',
            state: 'Lagos',
            phone: '08012345678',
        },
        phone: '08012345678',
        subtotal: 2500,
        deliveryFee: 500,
        total: 3000,
        paymentStatus: 'pending',
        orderStatus: 'pending',
        ...overrides,
    });
};

export const createTestVendorOrder = async (vendorId, orderId, overrides = {}) => {
    return VendorOrder.create({
        restaurantId: vendorId,
        userOrderId: orderId,
        items: [],
        commission: 250,
        vendorTotal: 2250,
        deliveryShare: 0,
        escrowAmount: 2250,
        escrowReleased: false,
        orderStatus: 'pending',
        ...overrides,
    });
};

export const createTestRider = async (vendorId, overrides = {}) => {
    return Rider.create({
        name: 'Test Rider',
        phone: `080${Date.now().toString().slice(-8)}`,
        password: await bcrypt.hash('password123', 10),
        vendorId,
        managedBy: 'vendor',
        status: 'available',
        isActive: true,
        ...overrides,
    });
};
