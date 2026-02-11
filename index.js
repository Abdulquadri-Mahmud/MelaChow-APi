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
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      -
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
      connectSrc: ["'self'", "https://grub-dash-frontend-xi.vercel.app", "https://grub-dash-api.vercel.app"],
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
    if (req.path.includes('/auth/') || req.path.includes('/profile')) {
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

// Vendors routes
app.use("/api/vendors", vendorRoutes);
app.use("/api/vendor/auth", vendorAuthRoutes);
app.use("/api/vendors/foods", foodRoutes);
app.use("/api/orders", vendorOrderRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin/auth', adminAuthRoutes); // ✅ NEW: Admin Auth
app.use('/api/admin/discounts', adminDiscountRoutes); // Discount Management
app.use('/api/admin/user', userManagementRoutes);
app.use('/api/admin/user/reviews', ReviewsRoutes);
app.use('/api/admin/locations', adminLocationRoutes);

// Transactions
app.use("/api/transactions", transactionRoutes);

// Orders
app.use("/api/orders", orderRoutes);

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

// -----------------------------
// Start Server AFTER Connecting to DB
// -----------------------------
// -----------------------------
// Start Server Logic (Vercel vs Local)
// -----------------------------

// 1. Export for Vercel (Serverless)
export default async (req, res) => {
  await connectDB(); // Ensure DB is connected for every request (cached in Lambda)
  return app(req, res);
};

// 2. Start Local Server (if not Vercel)
if (!process.env.VERCEL) {
  const startServer = async () => {
    try {
      await connectDB();

      const PORT = process.env.PORT || 5000;

      // Run seeders (only locally/VPS, avoid on serverless requests)
      await seedCategories();

      app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
      });
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error.message);
      process.exit(1);
    }
  };

  startServer();
}

