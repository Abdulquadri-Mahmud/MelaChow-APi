import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import connectDB from './config/db.js';
import userRoutes from './routes/user.routes.js';
import userPublicRoutes from './routes/user/public.routes.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import pinoHttp from 'pino-http';
import logger from './config/logger.js';
import transactionRoutes from './routes/transaction/transaction.routes.js';
import vendorRoutes from './routes/vendor/vendor.routes.js';
import foodRoutes from './routes/vendor/food.routes.js';
import vendorAuthRoutes from './routes/vendor/vendor.auth.routes.js';
import adminRoutes from './routes/Admin/admin.routes.js';
import adminAuthRoutes from './routes/Admin/admin.auth.routes.js'; // ✅ NEW: Admin Auth Routes
import userManagementRoutes from './routes/Admin/user_management_route/user.management.routes.js';
import ReviewsRoutes from './routes/user/user.reviews.routes.js';
import publicReviewsRoutes from './routes/user/public.reviews.routes.js';
import searchFoodRoutes from './routes/vendor/food.search.routes.js';
import orderRoutes from './routes/order/orderRoutes.js';
import vendorOrderRoutes from './routes/vendor/vendorOrder.routes.js';
import recommendationRoutes from './routes/user/recommendation.routes.js';
import categoryRoutes from './routes/category.routes.js';
import walletRoutes from './routes/wallet/wallet.routes.js';
import adminLocationRoutes from './routes/Admin/location.routes.js';
import publicLocationRoutes from './routes/location/location.routes.js';
import { seedCategories } from './config/categorySeed.js';
import discountRoutes from './routes/user/discount.routes.js';
import adminDiscountRoutes from './routes/Admin/discount.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import vendorNotificationRoutes from './routes/vendor/vendor.notification.routes.js';
import adminNotificationRoutes from './routes/Admin/admin.notification.routes.js';
import riderRoutes from "./routes/rider.routes.js";
import riderAuthRoutes from "./routes/riderAuth.routes.js";
import adminOrderRoutes from './routes/Admin/adminOrder.routes.js';
import platformFinanceRouter from './routes/Admin/platformFinance.routes.js';
import vendorMenuRoutes from "./routes/menu/vendorMenu.routes.js";
import customerMenuRoutes from "./routes/menu/customerMenu.routes.js";
import cartRoutes from "./routes/menu/cart.routes.js";
import socketHealthRoutes from './routes/socket.routes.js';
import riderNotificationRoutes from './routes/riderNotification.routes.js';
import http from 'http';
import redisClient from './config/redis.js';
import { initializeSocket } from './socket/socketServer.js';

dotenv.config();

// ----------------------------------------
// Sentry — Must initialize before Express app
// ----------------------------------------
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enabled: !!process.env.SENTRY_DSN, // Only active when DSN is set
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  integrations: [
    Sentry.httpIntegration(),
    Sentry.expressIntegration(),
    Sentry.mongoIntegration(),
  ],
});

// -----------------------------
// Initialize Express App
// -----------------------------
const app = express();

// -----------------------------
// CORS Configuration
// -----------------------------
const allowedOrigins = [
  'https://grub-dash-frontend-xi.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001', // Backend URL
  process.env.CLIENT_URL, // Dynamic from env
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,               // ✅ CRITICAL: Allow cookies
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
  maxAge: 86400,                   // 24 hours preflight cache
  // ❌ NO exposedHeaders - Set-Cookie is automatically handled
};

app.use(cors(corsOptions));

// -----------------------------
// Security & System Middlewares
// -----------------------------
// Configure Helmet for iOS Safari compatibility & Security Hardening
// 1. Enable CSP with targeted allowlist (Secure Hybrid Approach)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://grub-dash-frontend-xi.vercel.app"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for inline styles
      imgSrc: ["'self'", "data:", "https:"], // Allow external images
      connectSrc: [
        "'self'",
        "https://grub-dash-frontend-xi.vercel.app",
        process.env.CLIENT_URL,
      ].filter(Boolean),
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow cross-origin cookies (Required for iOS)
}));

// 2. Additive Security Headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: '10kb' })); // Parse JSON body
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser()); // Parse cookies
app.use(mongoSanitize()); // NoSQL injection protection

app.use(pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  // Redact sensitive fields from logs
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password', 'req.body.pin'],
    censor: '[REDACTED]',
  },
  // Skip health check spam
  autoLogging: {
    ignore: (req) => req.url === '/' || req.url === '/health',
  },
}));

// -----------------------------
// Cookie & Auth Debug Middleware (Development Only)
// -----------------------------
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    // Only log auth-related requests to reduce noise
    if (req.path.includes('/auth/') || req.path.includes('/profile') || req.path.includes('notifications')) {
      console.log('\n[Request Debug]', {
        method: req.method,
        path: req.path,
        origin: req.headers.origin,
        hasCookies: !!req.cookies && Object.keys(req.cookies).length > 0,
        cookies: req.cookies,
        hasAuthHeader: !!req.headers.authorization,
      });
    }
    next();
  });
}

// ----------------------------------------
// Rate Limiting — Tiered by sensitivity
// ----------------------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again in 15 minutes.' },
});

const walletLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many wallet requests, please slow down.' },
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many order requests, please slow down.' },
});

// Apply global limiter to all routes
app.use(globalLimiter);

// Apply strict limiters to sensitive route groups
app.use('/api/auth', authLimiter);
app.use('/api/user/auth', authLimiter);
app.use('/api/vendor/auth', authLimiter);
app.use('/api/admin/auth', authLimiter);
app.use('/api/wallet', walletLimiter);
app.use('/api/order', orderLimiter);
app.use('/api/orders', orderLimiter);


// console.log(cors(corsOptions))


// -----------------------------
// Root Endpoint
// -----------------------------
app.get("/", (req, res) => {
  res.send('Hello World');
});

// -----------------------------
// API ROUTES
// -----------------------------
app.use('/api/user/auth', userRoutes);
app.use('/api/user', userPublicRoutes); // Public user routes (e.g. location search)
app.use('/api/discounts', discountRoutes); // Discount Verification
app.use('/api/recommendations', recommendationRoutes); // NEW: Recommendations
app.use('/api/public/reviews', publicReviewsRoutes); // Public reviews routes
app.use('/api/search/food', searchFoodRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/locations', publicLocationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/socket', socketHealthRoutes);

// Vendors routes
app.use("/api/vendors", vendorRoutes);
app.use("/api/vendor/auth", vendorAuthRoutes);
app.use("/api/vendors/foods", foodRoutes);
app.use("/api/vendors/notifications", vendorNotificationRoutes);
app.use("/api/orders", vendorOrderRoutes);

// Riders routes
app.use("/api", riderRoutes);
app.use("/api", riderAuthRoutes);
app.use("/api/riders/notifications", riderNotificationRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin/auth', adminAuthRoutes); // ✅ NEW: Admin Auth
app.use('/api/admin/notifications', adminNotificationRoutes);
app.use('/api/admin/discounts', adminDiscountRoutes); // Discount Management
app.use('/api/admin/user', userManagementRoutes);
app.use('/api/admin/user/reviews', ReviewsRoutes);
app.use('/api/admin/locations', adminLocationRoutes);
app.use('/api/admin/orders', adminOrderRoutes);
app.use('/api/admin/finance', platformFinanceRouter);

// Transactions
app.use("/api/transactions", transactionRoutes);

// Orders
app.use("/api/orders", orderRoutes);

// --- V1 MENU SYSTEM ---
// Vendor-facing: /v1/menu/:vendorId/... (sections, items, portions, variants, choice-groups)
app.use("/v1/menu", vendorMenuRoutes);
// Customer-facing: /v1/vendors/:vendorId/menu and /v1/vendors/marketplace/...
app.use("/v1/vendors", customerMenuRoutes);
// Cart: /v1/cart/...
app.use("/v1/cart", cartRoutes);

// ✅ DEBUG: Log registered auth routes (dev only)
if (process.env.NODE_ENV !== 'production') {
  console.log('\n🔍 Registered User Auth Routes (/api/user/auth):');
  // Note: userRoutes is a router, so we can inspect its stack
  // Since it's mounted, we can only see paths relative to mount point
  userRoutes.stack.forEach(layer => {
    if (layer.route) {
      Object.keys(layer.route.methods).forEach(method => {
        console.log(`   ${method.toUpperCase()} ${layer.route.path}`);
      });
    } else if (layer.name === 'router') { // Sub-router (userAuthRoutes)
      console.log('   (Sub-router mounted)');
      // We can't easily iterate sub-router stack here without direct reference, 
      // but basic routes show up.
    }
  });
}

// ----------------------------------------
// Global Error Handler
// ----------------------------------------
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error!';

  // Report to Sentry — only real 5xx errors, not client mistakes
  if (statusCode >= 500) {
    Sentry.captureException(err, {
      extra: {
        method: req.method,
        url: req.url,
        userId: req.user?.id || req.user?._id || 'unauthenticated',
      },
    });
    logger.error({ err, method: req.method, url: req.url }, 'Unhandled server error');
  } else {
    logger.warn({ statusCode, message, url: req.url }, 'Client error');
  }

  // Special handling for CORS errors
  if (message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'CORS policy restriction',
    });
  }

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal Server Error'  // Never expose stack traces in production
      : message,
  });
});

// ─────────────────────────────────────────────────────
// SERVER STARTUP
// Render runs node index.js directly as a persistent
// process. Vercel serverless export removed —
// incompatible with persistent WebSocket connections.
// ─────────────────────────────────────────────────────
const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    const PORT = process.env.PORT || 5000;

    // 2. Run category seeder
    // Wrapped so a seed failure never blocks startup
    try {
      await seedCategories();
    } catch (seedErr) {
      logger.warn({ err: seedErr.message }, "⚠️ Category seed skipped");
    }

    // 2b. Connect Redis main client
    // pubClient and subClient connect inside initializeSocket via socketServer.js
    // redisClient (used for caching in notification.service and vendor.controller)
    // requires its own explicit connect call because lazyConnect: true is set
    try {
      await redisClient.connect();
      logger.info('✅ Redis main client connected and ready');
    } catch (redisErr) {
      logger.warn({ err: redisErr.message }, '⚠️ Redis unavailable — caching disabled, falling back to MongoDB');
      // Non-fatal: platform continues without caching
    }

    // 3. Create HTTP server and attach Socket.IO
    // Must use http.createServer — app.listen does not
    // expose the underlying server to Socket.IO
    const server = http.createServer(app);
    const io     = await initializeSocket(server);
    app.set("io", io);

    // 4. Start listening
    server.listen(PORT, () => {
      logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, '🚀 Server running');
      logger.info('🔌 Socket.IO ready for connections');
    });

    // 5. Graceful shutdown
    // Render sends SIGTERM before stopping the instance
    process.on("SIGTERM", () => {
      logger.info("SIGTERM received — shutting down gracefully...");
      server.close(async () => {
        try {
          await redisClient.quit();
          logger.info("✅ Redis main client disconnected");
        } catch (e) {
          logger.warn({ err: e.message }, "⚠️ Redis quit error");
        }
        logger.info("✅ Server closed");
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      logger.info("SIGINT received — shutting down...");
      server.close(async () => {
        try {
          await redisClient.quit();
        } catch (e) {}
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error({ err: error.message }, "❌ Failed to start server");
    process.exit(1);
  }
};

startServer();

// # Required for production error tracking
// # Get DSN from: https://sentry.io → New Project → Node.js
// SENTRY_DSN=your_dsn_here

