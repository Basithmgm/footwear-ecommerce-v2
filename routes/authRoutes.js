const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const profileController = require("../controllers/profileController");
const adminController = require("../controllers/adminController");
const auth = require("../middlewares/authMiddleware");

const adminAuth = require("../middlewares/adminAuth"); // Require the new middleware

// ============================================
// ADMIN ROUTES
// ============================================
router.get("/admin", adminController.getLogin);
router.post("/admin/login", adminController.postLogin);
router.get("/admin/logout", adminController.logout);

// Protected Admin Routes
router.get("/admin/users", adminAuth, adminController.getUsers);
router.post("/admin/users/block/:id", adminAuth, adminController.blockUser);
router.post("/admin/users/unblock/:id", adminAuth, adminController.unblockUser);

// ============================================
// AUTH & USER ROUTES
// ============================================

// PAGE ROUTES (GET)
router.get("/signup", authController.getSignup);
router.get("/login", authController.getLogin);
router.get("/otp", authController.getOTPPage);
router.get("/forgot-password", authController.getForgotPassword);

// Profile routes - USE THE CONTROLLER
router.get('/profile', auth, profileController.getProfile);
router.get('/profile/edit', auth, profileController.getEditProfile);

// ============================================
// FORM SUBMISSIONS (POST)
// ============================================
router.post("/signup", authController.postSignup);
router.post("/login", authController.postLogin);
router.post("/verify-otp", authController.postVerifyOTP);
router.post("/forgot-password", authController.postForgotPassword);
router.post("/logout", authController.logout);

const uploadProfile = require("../config/multer-profile");

// Profile update routes - ADD THESE
router.get("/profile/change-password", auth, profileController.getChangePassword);
router.get("/profile/verify-email", auth, profileController.getVerifyEmail);

// Handle file upload
router.post("/profile/update", auth, uploadProfile.single('profileImage'), profileController.updateProfile);
router.post("/profile/verify-email", auth, profileController.verifyEmailOTP);
router.post("/profile/change-password", auth, profileController.changeProfilePassword);

// Address Management - ADD THESE
router.get("/profile/address/add", auth, profileController.getAddAddress);
router.post("/profile/address/add", auth, profileController.postAddAddress);

router.get("/profile/address/edit/:id", auth, profileController.getEditAddress);
router.post("/profile/address/edit/:id", auth, profileController.postEditAddress);

router.post("/profile/address/delete/:id", auth, profileController.deleteAddress);
router.post("/profile/address/set-default/:id", auth, profileController.setDefaultAddress);

module.exports = router;
