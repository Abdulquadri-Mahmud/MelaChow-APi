import express from 'express';
import { handleQrScan, getQrAnalytics } from '../controller/qr.controller.js';
import multiAuth from '../middleware/multiAuth.middleware.js';

const router = express.Router();

// PUBLIC — hit by anonymous phone cameras, no auth
router.get('/scan/:vendorId', handleQrScan);

// PROTECTED — vendor (own data only) or admin
router.get('/vendors/:vendorId/analytics', multiAuth, getQrAnalytics);

export default router;
