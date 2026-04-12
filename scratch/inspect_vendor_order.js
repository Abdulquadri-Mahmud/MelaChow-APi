import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGO_URI = process.env.MONGO_URI;

async function runQuery() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const VendorOrder = mongoose.connection.collection('vendororders');
        
        const document = await VendorOrder.findOne(
            { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } },
            { 
                projection: { 
                    commission: 1, 
                    vendorTotal: 1, 
                    escrowAmount: 1, 
                    deliveryShare: 1, 
                    createdAt: 1 
                } 
            }
        );

        if (document) {
            console.log('RESULT_START');
            console.log(JSON.stringify(document, null, 2));
            console.log('RESULT_END');
        } else {
            console.log('No document found in the last 24 hours');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runQuery();
