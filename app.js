const path = require("path");
const express = require("express");
require("dotenv").config();

const sessionMiddleware = require("express-session");
const passport = require("./config/passport");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const app = express();

// Models
const User = require("./models/User");
const Banner = require("./models/Banner");
const BannerSetting = require("./models/BannerSetting");
const Analytics = require("./models/Analytics");
const Product = require("./models/Product");
const Category = require("./models/Category");

// ============================================
// Body parsers
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const helmet = require("helmet");
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'", // ApexCharts needs this
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://checkout.razorpay.com",
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com", // Google Fonts
        "https://cdn.jsdelivr.net", // Bootstrap, etc.
        "https://cdnjs.cloudflare.com", // FontAwesome
      ],
      fontSrc: [
        "'self'",
        "data:",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com",
      ],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      connectSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://api.razorpay.com",
        "https://lumberjack-cx.razorpay.com",
      ],
      frameSrc: [
        "'self'",
        "https://api.razorpay.com",
        "https://checkout.razorpay.com",
      ],
    },
  }),
);

// ============================================
// Session middleware
// ============================================
const MongoStore = require("connect-mongo").default || require("connect-mongo");

app.use(
  sessionMiddleware({
    secret: process.env.SESSION_SECRET || "footwear-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl:
        process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master",
    }),
    cookie: {
      secure: false, // set true only if using HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours default persistence
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

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
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master")
  .then(() => console.log("Connected to MongoDB: footwear-master"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
app.use(async (req, res, next) => {
  // If user is logged in, fetch full user data
  if (req.session && req.session.userId) {
    try {
      req.user = await User.findById(req.session.userId)
        .populate("role_id")
        .select("-password");
      if (req.user && req.user.status === "Blocked") {
        // If user is blocked, check if they are an admin
        const isAdmin = req.user.role_id && req.user.role_id.role_name === "admin";
        
        if (!isAdmin) {
          // If NOT an admin, destroy session safely (Selective logout)
          console.log(`🚫 BLOCKED USER DETECTED: ${req.user.email} (ID: ${req.session.userId}). Clearing session.`);
          
          if (req.session.adminId || req.session.isAdmin) {
            // IF an admin is also present in the same browser session, ONLY clear the user portion SILENTLY
            delete req.session.userId;
            return req.session.save((err) => {
              if (err) console.error("Session save error on block (silent):", err);
              // Do NOT redirect, let the admin request proceed to its destination (e.g., /admin/users)
              return next();
            });
          } else {
            // NORMAL FLOW: If no admin, destroy whole session and redirect to login
            return req.session.destroy((err) => {
              if (err) console.error("Session destroy error on block:", err);
              res.clearCookie("connect.sid"); // Ensure the cookie is cleared
              return res.redirect("/login?error=blocked");
            });
          }
        }
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
      req.adminUser = await User.findById(req.session.adminId)
        .populate("role_id")
        .select("-password");
      res.locals.adminUser = req.adminUser; // Make available in admin views
    } catch (err) {
      console.error("Error fetching adminUser:", err);
      req.adminUser = null;
    }
  } else {
    req.adminUser = null;
  }

  // ============================================
  // Global Data Hydration (Banners, Analytics, etc.)
  // ============================================
  try {
    // 1. Fetch Active Banners (Wrapped)
    try {
      const activeBanners = await Banner.find({ isActive: true }).sort({
        order: 1,
      });
      res.locals.activeBanners = activeBanners || [];
    } catch (e) {
      console.error("Banner fetch fail:", e);
      res.locals.activeBanners = [];
    }

    // 2. Fetch Banner settings
    try {
      const settings = await BannerSetting.find({
        key: {
          $in: [
            "bannerScrollSpeed",
            "bannerBackgroundColor",
            "bannerTextColor",
          ],
        },
      });

      const getSetting = (k, def) => {
        const s = settings.find((x) => x.key === k);
        return s ? s.value : def;
      };

      res.locals.bannerSpeed = getSetting("bannerScrollSpeed", 20);
      res.locals.bannerBgColor = getSetting("bannerBackgroundColor", "#88c8bc");
      res.locals.bannerTextColor = getSetting("bannerTextColor", "#ffffff");
    } catch (e) {
      res.locals.bannerSpeed = 20;
      res.locals.bannerBgColor = "#88c8bc";
      res.locals.bannerTextColor = "#ffffff";
    }

    // 3. Visitor Tracking (Analytics) - Safe background execution
    if (req.session) {
      (async () => {
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const sessionId = req.sessionID || "guest";

          // Step 1: Add session to the set (unique)
          const updateResult = await Analytics.findOneAndUpdate(
            { date: today, visitedSessions: { $ne: sessionId } },
            {
              $addToSet: { visitedSessions: sessionId },
              $inc: { uniqueVisitors: 1 },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        } catch (err) {
          // Silent log
          if (err.code !== 11000)
            console.error("Analytics Error (Silent):", err.message);
        }
      })();
    }
  } catch (globalErr) {
    console.error("Critical Global Middleware Error (Handled):", globalErr);
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

// admin routes handling
const adminOfferRoutes = require("./routes/adminOfferRoutes");
const adminCouponRoutes = require("./routes/adminCouponRoutes");
const adminReportRoutes = require("./routes/adminReportRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");

app.use(adminOfferRoutes);
app.use(adminCouponRoutes);
app.use(adminReportRoutes);
app.use(adminDashboardRoutes);

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
app.use("/cart", cartRoutes);

const checkoutRoutes = require("./routes/checkoutRoutes");
app.use("/checkout", checkoutRoutes);

const adminOrderRoutes = require("./routes/adminOrderRoutes");
app.use(adminOrderRoutes);

const userOrderRoutes = require("./routes/userOrderRoutes");
app.use(userOrderRoutes);

// Middleware imports

// Home route (after signup + OTP or login, redirect here)
app.get("/", noCache, async (req, res) => {
  try {
    const Product = require("./models/Product");
    const Category = require("./models/Category");
    const mongoose = require("mongoose");

    // Fetch active categories to ensure we only show products from active categories
    const activeCategories = await Category.findActiveCategories();
    const activeCategoryIds = activeCategories.map((cat) => cat._id);

    // Fetch up to 16 newly added active products for the homepage (unwound variants)
    const variantItems = await Product.aggregate([
      {
        $match: {
          status: "Available",
          isFeatured: true,
          category: { $in: activeCategoryIds },
          isDeleted: false,
          isBlocked: false,
        },
      },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.sizes": {
            $elemMatch: { status: "Active", isBlocked: false },
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 16 },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryDoc",
        },
      },
      { $unwind: "$categoryDoc" },
    ]);

    // ==== OFFER MATH CALCULATION (Homepage) ====
    const parsedProducts = variantItems.map((vItem) => {
      const productOffer = vItem.offerPercentage || 0;

      // Helper to traverse up the category tree and find the max offer
      const getCategoryOffer = (catId) => {
        let currentCat = activeCategories.find(
          (c) => c._id.toString() === catId.toString(),
        );
        let maxOffer = 0;
        while (currentCat) {
          if (currentCat.offerPercentage > maxOffer)
            maxOffer = currentCat.offerPercentage;
          if (currentCat.parentCategory) {
            currentCat = activeCategories.find(
              (c) => c._id.toString() === currentCat.parentCategory.toString(),
            );
          } else {
            break;
          }
        }
        return maxOffer;
      };

      const categoryOffer = vItem.categoryDoc
        ? getCategoryOffer(vItem.categoryDoc._id)
        : 0;
      const effectiveDiscount = Math.max(productOffer, categoryOffer);

      const pObj = {
        ...vItem,
        category: vItem.categoryDoc,
      };

      if (effectiveDiscount > 0 && effectiveDiscount <= 50) {
        pObj.hasOffer = true;
        pObj.offerDiscount = effectiveDiscount;
        pObj.discountedPrice = Math.round(
          pObj.salePrice - (pObj.salePrice * effectiveDiscount) / 100,
        );
      } else {
        pObj.hasOffer = false;
        pObj.discountedPrice = pObj.salePrice;
      }
      return pObj;
    });
    // ===========================================

    res.render("user/home", {
      title: "Footwear Home",
      user: req.user || null,
      activeMenu: "home",
      products: parsedProducts,
    });
  } catch (err) {
    console.error("Home route error:", err);
    res.render("user/home", {
      title: "Footwear Home",
      user: req.user || null,
      activeMenu: "home",
      products: [],
    });
  }
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
