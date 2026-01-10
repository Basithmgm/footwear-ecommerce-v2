const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

// ============================================
// PAGE ROUTES (GET)
// ============================================

// Signup page
router.get("/signup", authController.getSignup);

// Login page
router.get("/login", authController.getLogin);

// OTP verification page (email comes via query ?email=...)
router.get("/otp", authController.getOTPPage);

// ============================================
// FORM SUBMISSIONS (POST)
// ============================================

// Handle signup form (step 1: validate + send OTP)
router.post("/signup", authController.postSignup);

// Handle login form
router.post("/login", authController.postLogin);

// Handle OTP verification (step 2: create account + auto-login)
router.post("/verify-otp", authController.postVerifyOTP);

// Logout
router.post("/logout", authController.logout);

module.exports = router;