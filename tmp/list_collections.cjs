const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/melachow';

async function listCollections() {
  await mongoose.connect(mongoUri);
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections in database:');
  collections.forEach(c => console.log(`- ${c.name}`));
  await mongoose.connection.close();
}

listCollections();

