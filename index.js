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
import userManagementRoutes from './routes/Admin/user_management_route/user.management.routes.js';
import ReviewsRoutes from './routes/user/user.reviews.routes.js';
import searchFoodRoutes from './routes/vendor/food.search.routes.js';
import orderRoutes from './routes/order/orderRoutes.js';
import vendorOrderRoutes from './routes/vendor/vendorOrder.routes.js';
import categoryRoutes from './routes/category.routes.js';
import { seedCategories } from './config/categorySeed.js';

dotenv.config();

// -----------------------------
// Initialize Express App
// -----------------------------
const app = express();

// -----------------------------
// CORS Configuration
// -----------------------------
const allowedOrigins = [
  'https://grub-dash-topaz.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001', // Add backend URL for local self-calls or testing
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin); // Log blocked origins for debugging
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));

// -----------------------------
// Security & System Middlewares
// -----------------------------
app.use(helmet()); // Security headers
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON body
app.use(cookieParser()); // Parse cookies

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
app.use('/api/search/food', searchFoodRoutes);
app.use('/api/categories', categoryRoutes);

// Vendors routes
app.use("/api/vendors", vendorRoutes);
app.use("/api/vendor/auth", vendorAuthRoutes);
app.use("/api/vendors/foods", foodRoutes);
app.use("/api/orders", vendorOrderRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin/user', userManagementRoutes);
app.use('/api/admin/user/reviews', ReviewsRoutes);

// Transactions
app.use("/api/transactions", transactionRoutes);

// Orders
app.use("/api/orders", orderRoutes);

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

