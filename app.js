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
// Session middleware
// ============================================
const MongoStore = require("connect-mongo").MongoStore;

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
      maxAge: 24 * 60 * 60 * 1000, // 1 day
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
      console.log("App Middleware: User fetched:", req.user ? req.user.email : "Not found"); // DEBUG LOG
      res.locals.user = req.user; // Make available in all views
    } catch (err) {
      console.error("Error fetching user:", err);
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
});

// ============================================
// ROUTES
// ============================================

// JSON API routes (for any AJAX if needed)
const apiAuthRoutes = require("./routes/auth");
app.use("/auth", apiAuthRoutes);

// EJS Page routes (signup, login, otp, verify-otp, logout)
const authRoutes = require("./routes/authRoutes");
app.use(authRoutes);

// Home route (after signup + OTP or login, redirect here)
app.get("/", (req, res) => {
  res.render("user/home", {
    title: "Footwear Home",
    user: req.session.user || null,
  });
});

// 404
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// ============================================
// Start server
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});