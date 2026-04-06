const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/melachow';

async function runInvestigation() {
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;

    console.log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
    console.log('ðŸ•µï¸ MISSING PAYOUT INVESTIGATION');
    console.log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');

    // 1. Find all delivered orders with riders
    const deliveredOrders = await db.collection('orders').find({ 
      orderStatus: 'delivered', 
      riderId: { $ne: null } 
    }).toArray();

    for (const order of deliveredOrders) {
      // 2. Check rider wallet status
      const riderWallet = await db.collection('wallets').findOne({ 
        ownerId: order.riderId, 
        ownerModel: "Rider" 
      });

      const hasPayout = riderWallet ? riderWallet.transactions.some(t => {
        const matchesType = t.transactionType === 'rider_payout';
        const matchesId = (t.description && t.description.includes(order.orderId));
        return matchesType && matchesId;
      }) : false;

      // Report only if missing
      if (!hasPayout) {
        console.log(`REPORT FOR MISSING PAYOUT:`);
        console.log(`- Order ID:       ${order.orderId}`);
        console.log(`- Date Created:   ${order.createdAt}`);
        console.log(`- Payment Status: ${order.paymentStatus}`);
        console.log(`- Rider ID:       ${order.riderId}`);
        console.log(`- Rider Wallet:   ${riderWallet ? 'YES' : 'NO'}`);
        
        if (riderWallet) {
          console.log('\n--- RIDER WALLET TRANSACTIONS ---');
          if (riderWallet.transactions.length === 0) {
            console.log('Empty transaction list.');
          } else {
            riderWallet.transactions.forEach(t => {
              console.log(`[${t.type.toUpperCase()}] â‚¦${t.amount} | ${t.transactionType || 'null'} | ${t.description} | ${t.date}`);
            });
          }
        }

        // Check admin wallet for debit
        const adminWallet = await db.collection('wallets').findOne({ ownerModel: "Admin" });
        const adminDebit = adminWallet ? adminWallet.transactions.some(t => {
          const matchesType = t.transactionType === 'rider_payout';
          const matchesId = (t.description && t.description.includes(order.orderId));
          return t.type === 'debit' && matchesType && matchesId;
        }) : false;

        console.log(`- Admin Debit:    ${adminDebit ? 'YES' : 'NO'}`);
        console.log(`- Pay Reference:  ${order.paymentReference || 'N/A'}`);
        console.log('');
      }
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

runInvestigation();

