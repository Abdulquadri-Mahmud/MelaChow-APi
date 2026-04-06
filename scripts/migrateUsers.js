import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../model/user.model.js';

// Load environment variables
dotenv.config();

/**
 * Migration Script: Add New Fields to Existing Users
 * 
 * This script adds the new authentication and security fields to existing users:
 * - isActive: true (all existing users are active)
 * - loginAttempts: 0 (reset login attempts)
 * - isVerified: true (existing users are already verified)
 * 
 * Run this script ONCE after deploying the new authentication system.
 * 
 * Usage: node scripts/migrateUsers.js
 */

async function migrateExistingUsers() {
    try {
        console.log('ðŸ”„ Starting user migration...');
        console.log('ðŸ“¡ Connecting to MongoDB...');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('âœ… Connected to MongoDB');

        // Count users before migration
        const totalUsers = await User.countDocuments();
        console.log(`ðŸ“Š Total users in database: ${totalUsers}`);

        // Find users that need migration (missing new fields)
        const usersToMigrate = await User.countDocuments({
            $or: [
                { isActive: { $exists: false } },
                { loginAttempts: { $exists: false } },
                { isVerified: { $exists: false } }
            ]
        });

        console.log(`ðŸ”§ Users requiring migration: ${usersToMigrate}`);

        if (usersToMigrate === 0) {
            console.log('âœ… No users require migration. All users are up to date.');
            await mongoose.connection.close();
            return;
        }

        // Perform migration
        const result = await User.updateMany(
            {
                $or: [
                    { isActive: { $exists: false } },
                    { loginAttempts: { $exists: false } },
                    { isVerified: { $exists: false } }
                ]
            },
            {
                $set: {
                    isActive: true,           // All existing users are active
                    loginAttempts: 0,         // Reset login attempts
                    isVerified: true,         // Existing users are already verified
                }
            }
        );

        console.log(`âœ… Migration completed successfully!`);
        console.log(`ðŸ“ˆ Users updated: ${result.modifiedCount}`);
        console.log(`ðŸ“Š Users matched: ${result.matchedCount}`);

        // Verify migration
        const verifyCount = await User.countDocuments({
            isActive: true,
            loginAttempts: 0,
            isVerified: true
        });

        console.log(`âœ… Verification: ${verifyCount} users now have all required fields`);

        // Close connection
        await mongoose.connection.close();
        console.log('ðŸ”Œ Database connection closed');
        console.log('ðŸŽ‰ Migration completed successfully!');

    } catch (error) {
        console.error('âŒ Migration failed:', error);
        console.error('Error details:', error.message);

        // Close connection on error
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }

        process.exit(1);
    }
}

// Run migration
console.log('');
console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
console.log('   MelaChow User Migration Script');
console.log('   Adding Authentication & Security Fields');
console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
console.log('');

migrateExistingUsers();

