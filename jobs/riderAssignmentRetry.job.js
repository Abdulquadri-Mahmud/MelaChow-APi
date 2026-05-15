import VendorOrder from "../model/vendor/VendorOrder.js";
import { offerOrderToAvailableRiders } from "../services/riderAssignment.service.js";

/**
 * Continuous Assignment Retry Job
 * 
 * Scans for orders marked as 'ready_for_pickup' that haven't been successfully 
 * broadcasted to any riders yet (due to lack of availability at the time).
 * 
 * Runs every 30s as requested by USER.
 */
export async function retryPendingRiderAssignments() {
    try {
        // Find VendorOrders that are ready but not yet in assignment/broadcast
        // We look for 'ready_for_pickup' because that's where the automated system 
        // reverts to if no riders are found or if all riders reject.
        const pendingOrders = await VendorOrder.find({
            orderStatus: "ready_for_pickup",
            deletedAt: null
        }).limit(10); // Process in small batches to prevent server lag

        if (pendingOrders.length === 0) return { attempted: 0, successful: 0 };

        console.log(`🔄 [Assignment Retry] Found ${pendingOrders.length} pending order(s). Attempting broadcast...`);

        let successful = 0;
        for (const vOrder of pendingOrders) {
            try {
                const result = await offerOrderToAvailableRiders({
                    vendorOrderId: vOrder._id,
                    assignedBy: null
                });

                if (result.success) {
                    successful++;
                    console.log(`✅ [Assignment Retry] Successfully broadcasted Order ${vOrder._id} to ${result.riderCount} riders.`);
                }
            } catch (innerError) {
                console.error(`❌ [Assignment Retry] Failed for Order ${vOrder._id}:`, innerError.message);
            }
        }

        return { attempted: pendingOrders.length, successful };
    } catch (error) {
        console.error("❌ [Assignment Retry Job] Critical Error:", error.message);
        return { error: error.message };
    }
}
