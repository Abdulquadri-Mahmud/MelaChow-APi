import mongoose from 'mongoose';

const qrScanEventSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  ipHash: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    maxlength: 300,
  },
  scannedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { versionKey: false });

qrScanEventSchema.index({ vendor: 1, scannedAt: -1 });

export default mongoose.models.QrScanEvent || mongoose.model('QrScanEvent', qrScanEventSchema);
