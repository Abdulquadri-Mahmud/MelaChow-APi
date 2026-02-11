// scripts/generateVapidKeys.js
import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('VAPID Keys Generated:');
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
console.log('\nAdd these to your .env file:');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_EMAIL=mailto:admin@grubdash.com`);