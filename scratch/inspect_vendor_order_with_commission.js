import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGO_URI = process.env.MONGO_URI;

async function runQuery() {
    try {
        await mongoose.connect(MONGO_URI);
        const VendorOrder = mongoose.connection.collection('vendororders');
        
        // Find a recent order where commission is greater than 0
        const document = await VendorOrder.findOne(
            { commission: { $gt: 0 } },
            { 
                sort: { createdAt: -1 },
                projection: { 
                    commission: 1, 
                    vendorTotal: 1, 
                    escrowAmount: 1, 
                    deliveryShare: 1, 
                    createdAt: 1,
                    "items.name": 1,
                    "items.price": 1
                } 
            }
        );

        if (document) {
            console.log('RESULT_START');
            console.log(JSON.stringify(document, null, 2));
            console.log('RESULT_END');
        } else {
            console.log('No document found with commission > 0');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runQuery();
