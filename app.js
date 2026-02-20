const path = require("path");
const express = require("express");
require("dotenv").config();

const sessionMiddleware = require("express-session");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const app = express();

// ============================================
// Body parsers
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================
// Security Headers (Helmet)
// ============================================
const helmet = require("helmet");
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"], // Allows AJAX to self and CDNs
    },
  })
);

// ============================================
// Session middleware
// ============================================
const MongoStore = require("connect-mongo").default || require("connect-mongo");

app.use(
  sessionMiddleware({
    secret:
      process.env.SESSION_SECRET || "footwear-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master"
    }),
    cookie: {
      secure: false, // set true only if using HTTPS
      // maxAge: null // Session cookie (expires on browser close) by default
    },
  })
);

// ============================================
// Make session + flash successMessage available to views
// ============================================
app.use((req, res, next) => {
  // Whole session (for navbar, etc.)
  res.locals.session = req.session || null;

  // One-time success message for SweetAlert
  res.locals.successMessage = req.session.successMessage || "";
  if (req.session.successMessage) {
    delete req.session.successMessage; // use only once
  }

  next();
});

// ============================================
// View engine
// ============================================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ============================================
// Static files
// ============================================
app.use(express.static(path.join(__dirname, "public")));

// ============================================
// MongoDB connect
// ============================================
mongoose
  .connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master"
  )
  .then(() => console.log("Connected to MongoDB: footwear-master"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
// ============================================
// Global user middleware - ADD THIS
// ============================================
app.use(async (req, res, next) => {
  // If user is logged in, fetch full user data
  if (req.session && req.session.userId) {
    try {
      const User = require("./models/User");
      req.user = await User.findById(req.session.userId).populate('role_id').select("-password");
      console.log("App Middleware: User fetched:", req.user ? req.user.email : "Not found");
      if (req.user && req.user.wishlist) {
        console.log("App Middleware: Wishlist items:", req.user.wishlist.length);
      }
      res.locals.user = req.user; // Make available in all views
    } catch (err) {
      console.error("Error fetching user:", err);
      req.user = null;
    }
  } else {
    req.user = null;
  }

  // If ADMIN is logged in + has adminId, fetch admin user data separately
  if (req.session && req.session.adminId) {
    try {
      const User = require("./models/User");
      // Fetch admin user
      req.adminUser = await User.findById(req.session.adminId).populate('role_id').select("-password");
      console.log("App Middleware: Admin fetched:", req.adminUser ? req.adminUser.email : "Not found");
      res.locals.adminUser = req.adminUser; // Make available in admin views
    } catch (err) {
      console.error("Error fetching adminUser:", err);
      req.adminUser = null;
    }
  } else {
    req.adminUser = null;
  }

  // Fetch Active Banners for global use
  try {
    const Banner = require("./models/Banner");
    const BannerSetting = require("./models/BannerSetting");

    const activeBanners = await Banner.find({ isActive: true }).sort({ order: 1 });
    res.locals.activeBanners = activeBanners;

    // Fetch settings
    const settings = await BannerSetting.find({ key: { $in: ['bannerScrollSpeed', 'bannerBackgroundColor', 'bannerTextColor'] } });

    const getSetting = (k, def) => {
      const s = settings.find(x => x.key === k);
      return s ? s.value : def;
    };

    res.locals.bannerSpeed = getSetting('bannerScrollSpeed', 20);
    res.locals.bannerBgColor = getSetting('bannerBackgroundColor', '#88c8bc');
    res.locals.bannerTextColor = getSetting('bannerTextColor', '#ffffff');

  } catch (err) {
    console.error("Error fetching banners/settings:", err);
    res.locals.activeBanners = [];
    res.locals.bannerSpeed = 20;
    res.locals.bannerBgColor = '#88c8bc';
    res.locals.bannerTextColor = '#ffffff';
  }

  next();
});

// ============================================
// ROUTES
// ============================================

// Middleware imports
const noCache = require("./middlewares/noCache");
const fetchNavbarData = require("./middlewares/navMiddleware");

// Apply navigation middleware globally
app.use(fetchNavbarData);

// JSON API routes (for any AJAX if needed)
const apiAuthRoutes = require("./routes/auth");
app.use("/auth", apiAuthRoutes);

// EJS Page routes (signup, login, otp, verify-otp, logout)
const authRoutes = require("./routes/authRoutes");

app.use(authRoutes);

const shopRoutes = require("./routes/shopRoutes");

app.use(shopRoutes);

const categoryRoutes = require("./routes/categoryRoutes");
app.use(categoryRoutes);

const bannerRoutes = require("./routes/bannerRoutes");
app.use(bannerRoutes);

const productRoutes = require("./routes/productRoutes");
app.use(productRoutes);

const wishlistRoutes = require("./routes/wishlistRoutes");
app.use(wishlistRoutes);

const cartRoutes = require("./routes/cartRoutes");
app.use('/cart', cartRoutes);

const checkoutRoutes = require("./routes/checkoutRoutes");
app.use('/checkout', checkoutRoutes);

const adminOrderRoutes = require("./routes/adminOrderRoutes");
app.use(adminOrderRoutes);

const userOrderRoutes = require("./routes/userOrderRoutes");
app.use(userOrderRoutes);

// Middleware imports

// Home route (after signup + OTP or login, redirect here)
app.get("/", noCache, (req, res) => {
  res.render("user/home", {
    title: "Footwear Home",
    user: req.user || null,
    activeMenu: 'home'
  });
});

// 404 & Global Error Handling
const { notFound, errorHandler } = require("./middlewares/errorHandler");
app.use(notFound);
app.use(errorHandler);

// ============================================
// Start server
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});