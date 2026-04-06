import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper for ESM/CJS compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- MelaChow VAPID Key Generator ---');

try {
    const vapidKeys = webpush.generateVAPIDKeys();

    console.log('\nâœ… Successfully generated new VAPID keys!');
    console.log('\nCopy these values into your .env file:');
    console.log('-------------------------------------------');
    console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
    console.log(`VAPID_EMAIL=mailto:admin@melachow.com`);
    console.log('-------------------------------------------');

    console.log('\nNext Steps:');
    console.log('1. Open your .env file');
    console.log('2. Paste the lines above');
    console.log('3. Restart the server');
} catch (error) {
    console.error('âŒ Failed to generate VAPID keys:', error.message);
}

