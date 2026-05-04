import fs from 'fs';

const filePath = 'c:\\Users\\USER\\Documents\\AdeyemiCode\\MelaChow-Codebase\\MelaChowApi\\services\\rider.service.js';
let content = fs.readFileSync(filePath, 'utf8');

// Use regex to find the problematic blocks and replace them, avoiding emoji matching issues
const adminMatch = /if \(isAdminRider\) \{\s+deliveryFee = Number\(order\.deliveryFee \|\| 0\);/;
const vendorMatch = /\} else \{\s+const deliveryFeeEntry = order\.vendorDeliveryFees\?\.find\(\s+v => v\.restaurantId\?\.toString\(\) === riderVendorId\s+\);\s+deliveryFee = Number\(deliveryFeeEntry\?\.deliveryFee \|\| 0\);/;

if (adminMatch.test(content)) {
    console.log('Found admin block');
    content = content.replace(adminMatch, `if (isAdminRider) {
            deliveryFee = Number(order.deliveryFee || 0);
            
            // ✅ PROMO FIX: If delivery fee is 0, use the original fee from the promo snapshot
            if (deliveryFee === 0) {
                deliveryFee = (order.freeDeliveryPromo?.originalDeliveryFee || 
                              order.vendorDeliveryPromo?.originalDeliveryFee || 0);
            }`);
} else {
    console.log('Admin block not found');
}

if (vendorMatch.test(content)) {
    console.log('Found vendor block');
    content = content.replace(vendorMatch, `} else {
            const deliveryFeeEntry = order.vendorDeliveryFees?.find(
                v => v.restaurantId?.toString() === riderVendorId
            );
            deliveryFee = Number(deliveryFeeEntry?.deliveryFee || 0);
            
            // ✅ PROMO FIX: If vendor delivery fee is 0, check if a promo covered it.
            if (deliveryFee === 0) {
                const vendorPromo = order.vendorDeliveryPromo;
                if (vendorPromo?.applied && String(vendorPromo.vendorId) === riderVendorId) {
                    deliveryFee = vendorPromo.originalDeliveryFee;
                } else if (order.freeDeliveryPromo?.eligible) {
                    deliveryFee = order.freeDeliveryPromo.originalDeliveryFee;
                }
            }`);
} else {
    console.log('Vendor block not found');
}

fs.writeFileSync(filePath, content);
console.log('File updated');
