import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://melachow.com';

async function generateQr(vendorId, vendorName) {
  const url = `${FRONTEND_URL}/r/${vendorId}`;
  const outDir = path.join(__dirname, '../qr-output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${vendorName}-${vendorId}.png`);

  await QRCode.toFile(outPath, url, {
    width: 1000,
    margin: 2,
    errorCorrectionLevel: 'H',
  });

  console.log(`✅ Generated QR for ${vendorName}: ${outPath}`);
}

const [, , vendorId, vendorName] = process.argv;
if (!vendorId || !vendorName) {
  console.error('Usage: node scripts/generateVendorQr.js <vendorId> <vendorName>');
  process.exit(1);
}

generateQr(vendorId, vendorName).catch((err) => {
  console.error('❌ QR generation failed:', err.message);
  process.exit(1);
});
