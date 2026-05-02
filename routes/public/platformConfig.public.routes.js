import express from 'express';
import { getPublicPlatformConfig } from '../../controller/public/publicPlatformConfig.controller.js';

const router = express.Router();

router.get('/platform-config', getPublicPlatformConfig);

export default router;
