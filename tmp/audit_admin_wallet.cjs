const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/melachow';

async function runAudit() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('wallets');

    // 1. Current Balance
    const adminWallet = await collection.findOne({ ownerModel: "Admin" });
    console.log('\n--- ADMIN WALLET STATUS ---');
    if (!adminWallet) {
      console.log('Admin wallet not found!');
    } else {
      console.log(`Current Balance: â‚¦${adminWallet.balance}`);
    }

    // 2. Transaction Breakdown
    const results = await collection.aggregate([
      { $match: { ownerModel: "Admin" } },
      { $unwind: "$transactions" },
      {
        $group: {
          _id: { 
            type: "$transactions.transactionType", 
            direction: "$transactions.type" 
          },
          total: { $sum: "$transactions.amount" },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    console.log('\n--- TRANSACTION AGGREGATION (TYPE + DIRECTION) ---');
    results.forEach(r => {
      console.log(`${r._id.direction.toUpperCase()} | ${r._id.type || 'Legacy (null)'} : â‚¦${r.total} (${r.count} tx)`);
    });

    // 3. Mathematical Verification
    let totalCredits = 0;
    let totalDebits = 0;

    results.forEach(r => {
      if (r._id.direction === 'credit') totalCredits += r.total;
      else if (r._id.direction === 'debit') totalDebits += r.total;
    });

    console.log('\n--- AUDIT TOTALS ---');
    console.log(`Total Credits: â‚¦${totalCredits.toFixed(2)}`);
    console.log(`Total Debits:  â‚¦${totalDebits.toFixed(2)}`);
    console.log(`Expected Bal: â‚¦${(totalCredits - totalDebits).toFixed(2)}`);
    if (adminWallet) {
      const diff = Math.abs(adminWallet.balance - (totalCredits - totalDebits));
      if (diff < 0.01) {
        console.log('âœ… BALANCE MATCHES TRANSACTION LEDGER');
      } else {
        console.log(`âŒ DISCREPANCY DETECTED: â‚¦${diff.toFixed(2)}`);
      }
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error running audit:', error);
    process.exit(1);
  }
}

runAudit();

