const express = require("express");
const router = express.Router();
const passport = require("passport");
const authController = require("../controllers/authController");
const profileController = require("../controllers/profileController");
const adminController = require("../controllers/adminController");
const auth = require("../middlewares/authMiddleware");

const adminAuth = require("../middlewares/adminAuth"); // Require the new middleware

const guest = require("../middlewares/guest");
const noCache = require("../middlewares/noCache");

// ============================================
// ADMIN ROUTES
// ============================================
router.get("/admin", guest, noCache, adminController.getLogin);
router.post("/admin/login", adminController.postLogin);
router.get("/admin/logout", adminController.logout);

// Protected Admin Routes
router.get("/admin/users", adminAuth, noCache, adminController.getUsers);
router.post("/admin/users/block/:id", adminAuth, adminController.blockUser);
router.post("/admin/users/unblock/:id", adminAuth, adminController.unblockUser);
// Actually, protected pages usually don't need no-store unless highly sensitive. But preventing back button to login is the request.
// If I am on dashboard, and I hit back, I go to login? Login should redirect me forward.
// This is handled by guest middleware on login route.
// BUT, if I logout, and hit back, I see dashboard (from cache)?
// YES. User wants to prevent this too probably.
// "user cannot go back to the sign up or sign in page" -> This usually implies forward protection.
// But standard security also implies preventing back button to protected pages after logout.
// Let's stick to the request: "cannot go back to the sign up or sign in page"

// ============================================
// AUTH & USER ROUTES
// ============================================

// PAGE ROUTES (GET)
router.get("/signup", guest, noCache, authController.getSignup);
router.get("/login", guest, noCache, authController.getLogin);
router.get("/otp", guest, noCache, authController.getOTPPage);
router.get(
  "/forgot-password",
  guest,
  noCache,
  authController.getForgotPassword,
);

// Google Auth Routes
router.get("/auth/google", passport.authenticate("google", { 
  scope: ["profile", "email", "https://www.googleapis.com/auth/user.phonenumbers.read"],
  prompt: "select_account"
}));
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  authController.googleCallback
);

// Profile routes - USE THE CONTROLLER
router.get("/profile", auth, noCache, profileController.getProfile);
router.get("/profile/edit", auth, noCache, profileController.getEditProfile);

// ============================================
// FORM SUBMISSIONS (POST)
// ============================================
router.post("/signup", noCache, authController.postSignup);
router.post("/login", noCache, authController.postLogin);
router.post("/verify-otp", noCache, authController.postVerifyOTP);
router.post("/forgot-password", noCache, authController.postForgotPassword);
router.post("/logout", authController.logout);

const uploadProfile = require("../config/multer-profile");

// Profile update routes - ADD THESE
router.get(
  "/profile/change-password",
  auth,
  noCache,
  profileController.getChangePassword,
);
router.get(
  "/profile/verify-email",
  auth,
  noCache,
  profileController.getVerifyEmail,
);

// Handle file upload
// Wrapper to handle upload errors gracefully
const handleProfileUpload = (req, res, next) => {
  const upload = uploadProfile.single("profileImage");
  upload(req, res, function (err) {
    if (err) {
      console.error("Profile upload error:", err);
      // Multer errors (limits, file type) or Cloudinary errors
      return res.redirect(
        "/profile/edit?error=" + encodeURIComponent(err.message),
      );
    }
    next();
  });
};

router.post(
  "/profile/update",
  auth,
  handleProfileUpload,
  profileController.updateProfile,
);
router.post("/profile/verify-email", auth, profileController.verifyEmailOTP);
router.post(
  "/profile/change-password",
  auth,
  profileController.changeProfilePassword,
);

// Address Management - ADD THESE
router.get(
  "/profile/address/add",
  auth,
  noCache,
  profileController.getAddAddress,
);
router.post("/profile/address/add", auth, profileController.postAddAddress);

router.get(
  "/profile/address/edit/:id",
  auth,
  noCache,
  profileController.getEditAddress,
);
router.post(
  "/profile/address/edit/:id",
  auth,
  profileController.postEditAddress,
);

router.post(
  "/profile/address/delete/:id",
  auth,
  profileController.deleteAddress,
);
router.post(
  "/profile/address/set-default/:id",
  auth,
  profileController.setDefaultAddress,
);

module.exports = router;
