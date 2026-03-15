import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import userRoutes from './routes/user.routes.js';
import userPublicRoutes from './routes/user/public.routes.js';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
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
import { initializeSocket } from './socket/socketServer.js';

dotenv.config();

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
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON body
app.use(cookieParser()); // Parse cookies

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

// Rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000, // Increased to avoid blocking dev work
}));


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

// -----------------------------
// Global Error Handler
// -----------------------------
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error!';

  // Special handling for CORS errors
  if (message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'CORS policy restriction'
    });
  }

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message
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
      console.warn("⚠️ Category seed skipped:", seedErr.message);
    }

    // 3. Create HTTP server and attach Socket.IO
    // Must use http.createServer — app.listen does not
    // expose the underlying server to Socket.IO
    const server = http.createServer(app);
    const io     = initializeSocket(server);
    app.set("io", io);

    // 4. Start listening
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔌 Socket.IO ready for connections`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // 5. Graceful shutdown
    // Render sends SIGTERM before stopping the instance
    process.on("SIGTERM", () => {
      console.log("SIGTERM received — shutting down gracefully...");
      server.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      console.log("SIGINT received — shutting down...");
      server.close(() => {
        process.exit(0);
      });
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

