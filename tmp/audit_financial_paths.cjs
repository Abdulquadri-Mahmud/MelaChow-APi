const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/grubdash';

async function runAudit() {
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;

    console.log('─────────────────────────────────────────────────────────────');
    console.log('📊 FINANCIAL PATH AUDIT REPORT');
    console.log('─────────────────────────────────────────────────────────────\n');

    // --- CHECK 1: Escrow Status ---
    console.log('CHECK 1 — Escrow Release Path (Pending Obligations)');
    
    // Find paid orders where escrow hasn't been released
    const pendingEscrows = await db.collection('vendororders').aggregate([
      { $match: { escrowReleased: false, escrowAmount: { $gt: 0 } } },
      {
        $lookup: {
          from: 'orders',
          localField: 'userOrderId',
          foreignField: '_id',
          as: 'parentOrder'
        }
      },
      { $unwind: '$parentOrder' },
      { $match: { 'parentOrder.paymentStatus': 'paid' } }
    ]).toArray();

    const totalEscrowOwed = pendingEscrows.reduce((sum, vo) => sum + (vo.escrowAmount || 0), 0);
    const adminWallet = await db.collection('wallets').findOne({ ownerModel: "Admin" });
    const adminBal = adminWallet ? adminWallet.balance : 0;

    console.log(`- VendorOrders awaiting escrow: ${pendingEscrows.length}`);
    console.log(`- Total Escrow Owed: ₦${totalEscrowOwed.toFixed(2)}`);
    console.log(`- Admin Wallet Balance: ₦${adminBal.toFixed(2)}`);

    if (adminBal >= totalEscrowOwed) {
      console.log('✅ PASS: Admin wallet covers all pending escrow obligations.');
    } else {
      console.log('❌ FAIL: Admin wallet has insufficient funds for pending escrows!');
    }
    console.log('');

    // --- CHECK 2: Rider PPayouts ---
    console.log('CHECK 2 — Rider Payout Path (Undelivered Payments)');
    
    // Find delivered orders without a matching rider_payout transaction
    const missingPayouts = await db.collection('orders').aggregate([
      { $match: { orderStatus: 'delivered', riderId: { $ne: null } } },
      {
        $lookup: {
          from: 'wallets',
          localField: 'riderId',
          foreignField: 'ownerId',
          as: 'riderWallet'
        }
      },
      {
        $project: {
          orderId: 1,
          riderId: 1,
          hasPayout: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: [{ $arrayElemAt: ['$riderWallet.transactions', 0] }, []] },
                    as: 'tx',
                    cond: { 
                        $and: [
                            { $eq: ['$$tx.transactionType', 'rider_payout'] },
                            { $regexMatch: { input: { $ifNull: ['$$tx.description', ''] }, regex: '$orderId' } }
                        ]
                    }
                  }
                }
              },
              0
            ]
          }
        }
      },
      { $match: { hasPayout: false } }
    ]).toArray();

    console.log(`- Delivered orders missing rider_payout: ${missingPayouts.length}`);
    if (missingPayouts.length === 0) {
      console.log('✅ PASS: All delivered orders have associated rider payouts in the ledger.');
    } else {
      console.log('❌ FAIL: Detected delivered orders without transaction records!');
    }
    console.log('');

    // --- CHECK 3: Legacy Transactions ---
    console.log('CHECK 3 — Legacy Tagging (Untagged Transactions)');
    
    const legacyTx = adminWallet ? adminWallet.transactions.filter(t => !t.transactionType) : [];
    const debits = legacyTx.filter(t => t.type === 'debit');

    console.log(`- Total untagged transactions: ${legacyTx.length}`);
    console.log(`- Untagged debits: ${debits.length}`);

    if (legacyTx.length > 0) {
      console.log('\nLEGACY LIST:');
      legacyTx.forEach(t => {
        console.log(`[${t.type.toUpperCase()}] ₦${t.amount} | ${t.description || 'No desc'} | ${t.date}`);
      });
    }

    if (debits.length === 0) {
      console.log('\n✅ PASS: No untagged debits found. Mathematical balance formula remains valid.');
    } else {
      console.log('\n⚠️ WARNING: Untagged debits found. These may represent untracked refunds/payouts.');
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

runAudit();
