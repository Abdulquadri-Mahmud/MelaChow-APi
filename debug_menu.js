import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor           from './MelaChowApi/model/vendor/vendor.model.js';
import MenuItem         from './MelaChowApi/model/menu/MenuItem.js';
import VendorMenuSection from './MelaChowApi/model/menu/VendorMenuSection.js';

dotenv.config({ path: './MelaChowApi/.env' });

async function checkVendor() {
    await mongoose.connect(process.env.MONGO_URI); 
    
    const vendorId = '69af233b965c7cd635d9a6a7';
    console.log(`Checking Vendor: ${vendorId}`);
    
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
        console.log('❌ Vendor not found');
    } else {
        console.log(`✅ Vendor found: ${vendor.storeName}`);
        console.log(`- isOpen: ${vendor.isOpen}`);
        console.log(`- isActive: ${vendor.isActive}`);
        
        const sectionCount = await VendorMenuSection.countDocuments({ vendor_id: vendorId });
        console.log(`- Section count: ${sectionCount}`);
        
        const itemCount = await MenuItem.countDocuments({ 
            vendor_id: vendorId,
            is_archived: false,
            is_available: true,
            is_in_stock: true
        });
        console.log(`- Active item count: ${itemCount}`);
    }
    
    await mongoose.disconnect();
}

checkVendor().catch(console.error);
