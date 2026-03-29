const User = require("../models/User");
const Role = require("../models/Role");
const OTP = require("../models/OTP");
const Wallet = require("../models/Wallet");
const ReferralOffer = require("../models/ReferralOffer");
const { sendOTPEmail } = require("../services/emailService");
const bcrypt = require("bcryptjs");

// ============================================
// VALIDATION FUNCTIONS
// ============================================

const validateName = (name) => {
  if (!name || name.trim().length < 2) {
    return "Name must be at least 2 characters";
  }
  return null;
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return "Valid email is required";
  }
  return null;
};

const validatePassword = (password) => {
  if (!password || password.length < 6) {
    return "Password must be at least 6 characters";
  }
  return null;
};

const validateConfirmPassword = (password, confirmPassword) => {
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  return null;
};

// ============================================
// PAGE ROUTES (GET)
// ============================================

// Show signup page
exports.getSignup = (req, res) => {
  const referralCode = req.query.ref || "";
  res.render("auth/signup", {
    pageTitle: "Sign Up",
    oldInput: { name: "", email: "", referralCode: "" }, // view expects 'name', we'll map existing form field 'name' to 'full_name' in POST
    referralCode,
    errors: [],
    successMessage: "",
  });
};

// Show login page
exports.getLogin = (req, res) => {
  const savedEmail = req.cookies.remembered_email || "";
  res.render("auth/login", {
    pageTitle: "Login",
    oldInput: { email: "" },
    savedEmail,
    errors: [],
    successMessage: "",
  });
};

// Show forgot password page
exports.getForgotPassword = (req, res) => {
  res.render("auth/forgot-password", {
    pageTitle: "Forgot Password",
    oldInput: { email: "" },
    errors: [],
    successMessage: "",
  });
};

// Show OTP page (used for signup + reset)
exports.getOTPPage = (req, res) => {
  const email = req.query.email;
  const mode = req.query.mode || "signup"; // 'signup' or 'reset'

  if (!email) {
    return res.redirect("/signup");
  }

  res.render("auth/otp", {
    pageTitle: mode === "reset" ? "Reset Password - Verify OTP" : "Verify OTP",
    email,
    errors: [],
    successMessage: "",
    isReset: mode === "reset",
  });
};

// ============================================
// FORM SUBMISSIONS (POST)
// ============================================

// Handle forgot password (step 1: form + send OTP)
exports.postForgotPassword = async (req, res) => {
  const { email, password, confirmPassword } = req.body;
  const errors = [];

  // Validate fields
  const emailError = validateEmail(email);
  if (emailError) errors.push({ msg: emailError });

  const passwordError = validatePassword(password);
  if (passwordError) errors.push({ msg: passwordError });

  const confirmError = validateConfirmPassword(password, confirmPassword);
  if (confirmError) errors.push({ msg: confirmError });

  if (errors.length > 0) {
    return res.status(422).render("auth/forgot-password", {
      pageTitle: "Forgot Password",
      oldInput: { email },
      errors,
      successMessage: "",
    });
  }

  try {
    // Check user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).render("auth/forgot-password", {
        pageTitle: "Forgot Password",
        oldInput: { email },
        errors: [{ msg: "No account found with this email." }],
        successMessage: "",
      });
    }

    // Save reset data in session
    req.session.resetPasswordData = {
      email,
      newPassword: password,
      createdAt: Date.now(),
    };

    // Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Remove old OTPs
    await OTP.deleteMany({ email });

    // Create new OTP (5 mins expiry)
    await OTP.create({
      email,
      otp: otpCode,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // Send OTP email (Async - Fire and forget)
    sendOTPEmail(email, otpCode)
      .then(() => console.log("Forgot password OTP sent to:", email))
      .catch((emailErr) =>
        console.error("Error sending forgot-password OTP email:", emailErr),
      );

    // Redirect to OTP page in reset mode immediately
    return res.redirect(`/otp?email=${encodeURIComponent(email)}&mode=reset`);
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).render("auth/forgot-password", {
      pageTitle: "Forgot Password",
      oldInput: { email },
      errors: [{ msg: "Something went wrong. Please try again." }],
      successMessage: "",
    });
  }
};

// Handle signup (step 1: form + send OTP)
exports.postSignup = async (req, res) => {
  const { name, email, password, confirmPassword, referralCode } = req.body;
  const errors = [];

  // Validate all fields
  const nameError = validateName(name); // 'name' comes from form, will be 'full_name' in DB
  if (nameError) errors.push({ msg: nameError });

  const emailError = validateEmail(email);
  if (emailError) errors.push({ msg: emailError });

  const passwordError = validatePassword(password);
  if (passwordError) errors.push({ msg: passwordError });

  const confirmError = validateConfirmPassword(password, confirmPassword);
  if (confirmError) errors.push({ msg: confirmError });

  // Return if validation failed
  if (errors.length > 0) {
    return res.status(422).render("auth/signup", {
      pageTitle: "Sign Up",
      oldInput: { name, email, referralCode },
      referralCode,
      errors,
      successMessage: "",
    });
  }

  try {
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(422).render("auth/signup", {
        pageTitle: "Sign Up",
        oldInput: { name, email },
        errors: [
          {
            msg: "Email is already registered. Please sign in instead.",
          },
        ],
        successMessage: "",
      });
    }

    // Store signup data in session (PLAIN password)
    req.session.signupData = {
      full_name: name, // Converting 'name' -> 'full_name' here
      email,
      password, // plain password
      referralCode,
      createdAt: Date.now(),
    };

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete old OTPs for this email
    await OTP.deleteMany({ email });

    // Create new OTP (expiresAt handled by model)
    await OTP.create({
      email,
      otp: otpCode,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    // Send OTP email (Async - Fire and forget)
    sendOTPEmail(email, otpCode).catch((emailErr) =>
      console.error("Error sending OTP email:", emailErr),
    );

    // Explicitly save session before redirect to prevent race condition
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).render("auth/signup", {
          pageTitle: "Sign Up",
          oldInput: { name, email },
          errors: [{ msg: "Session error. Please try again." }],
          successMessage: "",
        });
      }
      // Redirect to OTP page
      return res.redirect(`/otp?email=${encodeURIComponent(email)}`);
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).render("auth/signup", {
      pageTitle: "Sign Up",
      oldInput: { name, email },
      errors: [{ msg: "Something went wrong. Please try again." }],
      successMessage: "",
    });
  }
};

// Handle login
exports.postLogin = async (req, res) => {
  let { email, password, rememberMe } = req.body;

  // Defensive: trim and lowercase email manually
  email = email ? email.trim().toLowerCase() : "";

  console.log("DEBUG: Login Attempt for Email:", email);
  const errors = [];

  // Validate email
  const emailError = validateEmail(email);
  if (emailError) errors.push({ msg: emailError });

  // Validate password
  if (!password) {
    errors.push({ msg: "Password is required" });
  }

  // Return if validation failed
  if (errors.length > 0) {
    return res.status(422).render("auth/login", {
      pageTitle: "Login",
      oldInput: { email },
      errors,
      successMessage: "",
    });
  }

  try {
    // Find user and populate Role to check permissions
    const user = await User.findOne({ email }).populate("role_id");
    console.log("DEBUG: User Query Result:", user ? `Found (ID: ${user._id}, Verified: ${user.isVerified})` : "NOT FOUND");

    if (!user) {
      return res.status(401).render("auth/login", {
        pageTitle: "Login",
        oldInput: { email },
        errors: [{ msg: "Invalid email or password" }],
        successMessage: "",
      });
    }

    // Compare plain password with stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    console.log("DEBUG: Password Comparison Result:", isMatch ? "MATCH" : "MISMATCH");

    if (!isMatch) {
      return res.status(401).render("auth/login", {
        pageTitle: "Login",
        oldInput: { email },
        errors: [{ msg: "Invalid email or password" }],
        successMessage: "",
      });
    }

    // Check if blocked using 'status' field enum: ['Active', 'Blocked']
    if (user.status === "Blocked") {
      return res.status(403).render("auth/login", {
        pageTitle: "Login",
        oldInput: { email },
        errors: [
          { msg: "Your account has been blocked. Please contact support." },
        ],
        successMessage: "",
      });
    }

    // Check if verified
    if (!user.isVerified) {
      return res.status(403).render("auth/login", {
        pageTitle: "Login",
        oldInput: { email },
        errors: [
          {
            msg: "Your email is not verified. Please check your inbox for OTP.",
          },
        ],
        successMessage: "",
      });
    }

    // Update last_login_at
    user.last_login_at = new Date();
    await user.save();

    // Determine if admin
    let isAdmin = false;
    if (user.role_id && user.role_id.role_name === "admin") {
      isAdmin = true;
      req.session.isAdmin = true;
    }

    // Set session
    req.session.userId = user._id;
    console.log("LOGIN Session Set userId:", req.session.userId); // DEBUG LOG
    // req.session.user => REMOVED (Relies on DB fetch in middleware)

    // Remember Me Logic
    if (rememberMe === "true" || rememberMe === true) {
      // Set session to 24 hours
      req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
      // Set a cookie for the email that lasts 24 hours
      res.cookie("remembered_email", email, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
      });
    } else {
      req.session.cookie.maxAge = null; // Session cookie (expires on close)
      // Clear the remembered email cookie if not checked
      res.clearCookie("remembered_email");
    }

    // One-time success message for SweetAlert
    req.session.successMessage = "Login successful! Welcome back.";

    // Redirect admins to dashboard, users to home
    if (isAdmin) {
      return res.redirect("/admin/users");
    } else {
      console.log("LOGIN Redirecting to home"); // DEBUG LOG
      // Explicitly save session to ensure persistence before redirect
      req.session.save((err) => {
        if (err) console.error("LOGIN Session Save Error:", err);
        return res.redirect("/");
      });
    }
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).render("auth/login", {
      pageTitle: "Login",
      oldInput: { email },
      errors: [{ msg: "Something went wrong. Please try again." }],
      successMessage: "",
    });
  }
};

// Handle OTP verification (sign up step 2)
exports.postVerifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res
      .status(400)
      .json({ success: false, message: "Email and OTP are required" });
  }

  try {
    console.log("VERIFY OTP ATTEMPT:", { email, otp });

    // Find OTP record
    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      console.log(" OTP not found");
      return res
        .status(400)
        .json({ success: false, message: "Invalid OTP. Please try again." });
    }

    // Check expiry (5 minutes)
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteMany({ email });
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please sign up again to get a new OTP.",
      });
    }

    // Get reset data (for forgot password flow)
    const resetData = req.session.resetPasswordData;

    // Get signup data (for normal signup flow)
    const signupData = req.session.signupData;

    // 1) RESET PASSWORD FLOW
    if (resetData && resetData.email === email) {
      // Find existing user
      const user = await User.findOne({ email });
      if (!user) {
        return res
          .status(400)
          .json({ success: false, message: "No user found for this email." });
      }

      // Hash new password and save
      const hashedPassword = await bcrypt.hash(resetData.newPassword, 10);
      user.password = hashedPassword;
      // If user verifies via OTP for password reset, they are verified
      user.isVerified = true;
      await user.save();

      // Clean up OTP + session
      await OTP.deleteMany({ email });
      delete req.session.resetPasswordData;

      // Do NOT auto-login; send to login page
      req.session.successMessage =
        "Password reset successfully. Please log in with your new password.";

      return res.json({
        success: true,
        message:
          "Password reset successfully. Please log in with your new password.",
        redirectUrl: "/login",
      });
    }

    // 2) SIGNUP FLOW
    if (!signupData || signupData.email !== email) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please sign up again to get a new OTP.",
      });
    }

    // Validate Name Presence (mapped to full_name)
    if (!signupData.full_name) {
      return res.status(400).json({
        success: false,
        message: "Session lost user details. Please sign up again.",
        redirectUrl: "/signup",
      });
    }

    // Find USER ROLE
    const userRole = await Role.findOne({ role_name: "user" });
    if (!userRole) {
      console.error("'user' Role not found in DB! Seed script likely failed.");
      return res.status(500).json({
        success: false,
        message: "System configuration error. Please contact admin.",
      });
    }

    // Create or update user
    let user = await User.findOne({ email });
    const hashedPassword = await bcrypt.hash(signupData.password, 10);

    const generateReferralCode = (emailStr) => {
      const prefix = emailStr.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = prefix;
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    let newReferralCode = generateReferralCode(signupData.email);
    // Ensure uniqueness
    while (await User.findOne({ referralCode: newReferralCode })) {
      newReferralCode = generateReferralCode(signupData.email);
    }

    let referrer = null;
    if (signupData.referralCode) {
      referrer = await User.findOne({ referralCode: signupData.referralCode });
    }

    if (!user) {
      user = new User({
        full_name: signupData.full_name,
        email: signupData.email,
        password: hashedPassword,
        isVerified: true,
        status: "Active",
        role_id: userRole._id, // Assign Role ID
        last_login_at: new Date(),
        referralCode: newReferralCode,
        referredBy: referrer ? referrer._id : undefined
      });
      await user.save();
    } else {
      user.password = hashedPassword;
      user.isVerified = true;
      user.status = "Active";
      user.role_id = userRole._id;
      user.last_login_at = new Date();
      if (!user.referralCode) user.referralCode = newReferralCode;
      if (!user.referredBy && referrer) user.referredBy = referrer._id;
      await user.save();
    }

    // Process Referral Rewards
    if (referrer) {
      const referralOffer = await ReferralOffer.findOne({ isActive: true });
      if (referralOffer) {
        // Credit Referrer
        if (referralOffer.referrerReward > 0) {
          let referrerWallet = await Wallet.findOne({ userId: referrer._id });
          if (!referrerWallet) {
            referrerWallet = new Wallet({ userId: referrer._id, balance: 0, transactions: [] });
          }
          referrerWallet.balance += referralOffer.referrerReward;
          referrerWallet.transactions.push({
            amount: referralOffer.referrerReward,
            type: "Credit",
            description: "Referral Bonus (Referrer)"
          });
          await referrerWallet.save();
        }

        // Credit Referee
        if (referralOffer.refereeReward > 0) {
          let refereeWallet = await Wallet.findOne({ userId: user._id });
          if (!refereeWallet) {
            refereeWallet = new Wallet({ userId: user._id, balance: 0, transactions: [] });
          }
          refereeWallet.balance += referralOffer.refereeReward;
          refereeWallet.transactions.push({
            amount: referralOffer.refereeReward,
            type: "Credit",
            description: "Referral Bonus (Referee)"
          });
          await refereeWallet.save();
        }
      }
    }

    // Delete OTPs
    await OTP.deleteMany({ email });

    // Clear signup session data
    delete req.session.signupData;

    // Set session (auto-login after OTP)
    req.session.userId = user._id;
    // req.session.user => REMOVED

    req.session.successMessage =
      "Account created and verified successfully! Welcome to Footwear.";

    return res.json({
      success: true,
      message: "Account verified successfully!",
      redirectUrl: "/",
    });
  } catch (err) {
    console.error("OTP verify error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

// Logout
exports.logout = (req, res) => {
  // If admin is logged in (same browser), don't destroy session, just remove user data
  if (req.session.isAdmin || req.session.adminId) {
    req.session.userId = null;
    delete req.session.userId;
    // req.session.user is already removed from storage logic, but just in case
    if (req.session.user) delete req.session.user;

    req.session.successMessage = "Logged out successfully";
    return res.redirect("/");
  }

  // If no admin, destroy everything
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/");
  });
};
