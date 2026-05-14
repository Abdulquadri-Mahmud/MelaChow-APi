import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkAssignments() {
    try {
        const mongoUri = process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to DB');

        const RiderAssignment = mongoose.model('RiderAssignment', new mongoose.Schema({}, { strict: false }));
        
        // Find all active assignments
        const assignments = await RiderAssignment.find({
            status: 'assigned',
            expiresAt: { $gt: new Date() }
        });

        console.log(`📊 Found ${assignments.length} active broadcast assignments:`);
        assignments.forEach(a => {
            console.log(` - Order: ${a.orderId}, Rider: ${a.riderId}, Status: ${a.status}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error checking assignments:', error);
        process.exit(1);
    }
}

checkAssignments();
