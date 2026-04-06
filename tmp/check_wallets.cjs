const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/melachow';

async function checkAllWallets() {
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const collection = db.collection('wallets');

    const allModels = await collection.distinct('ownerModel');
    console.log('Available Owner Models in Wallets:', allModels);

    const firstFive = await collection.find({}).limit(5).toArray();
    console.log('\n--- FIRST 5 WALLETS ---');
    console.dir(firstFive, { depth: null });

    await mongoose.connection.close();
  } catch (error) {
    console.error(error);
  }
}

checkAllWallets();

