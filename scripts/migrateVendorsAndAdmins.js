import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from '../model/vendor/vendor.model.js';
import Admin from '../model/Admin/admin.model.js';

dotenv.config();

const migrateVendorsAndAdmins = async () => {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.DB_CONNECTION_STRING);
        console.log('✅ Connected to MongoDB');

        // =============================
        // VENDOR MIGRATION
        // =============================
        console.log('\n--- Migrating Vendors ---');

        // Find vendors missing new fields
        const vendorsToUpdate = await Vendor.countDocuments({
            $or: [
                { loginAttempts: { $exists: false } },
                { active: { $exists: false } }
            ]
        });

        console.log(`Found ${vendorsToUpdate} vendors needing update.`);

        if (vendorsToUpdate > 0) {
            const result = await Vendor.updateMany(
                {
                    $or: [
                        { loginAttempts: { $exists: false } },
                        { active: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        loginAttempts: 0,
                        // Ensure Active status is set (default true if undefined)
                        active: true
                    }
                }
            );
            console.log(`✅ Updated ${result.modifiedCount} vendor records.`);
        } else {
            console.log('🎉 All vendors are already up to date.');
        }

        // =============================
        // ADMIN MIGRATION
        // =============================
        console.log('\n--- Migrating Admins ---');

        // Find admins missing new fields
        const adminsToUpdate = await Admin.countDocuments({
            $or: [
                { loginAttempts: { $exists: false } },
                { isActive: { $exists: false } }
            ]
        });

        console.log(`Found ${adminsToUpdate} admins needing update.`);

        if (adminsToUpdate > 0) {
            const result = await Admin.updateMany(
                {
                    $or: [
                        { loginAttempts: { $exists: false } },
                        { isActive: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        loginAttempts: 0,
                        isActive: true
                    }
                }
            );
            console.log(`✅ Updated ${result.modifiedCount} admin records.`);
        } else {
            console.log('🎉 All admins are already up to date.');
        }

        console.log('\n✨ Migration Complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration Error:', error);
        process.exit(1);
    }
};

migrateVendorsAndAdmins();
