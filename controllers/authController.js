// controllers/authController.js
const User = require("../models/User");
const OTP = require("../models/OTP");
const { sendOTPEmail } = require("../services/emailService");
const bcrypt = require("bcrypt");

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
  res.render("auth/signup", {
    pageTitle: "Sign Up",
    oldInput: { name: "", email: "" },
    errors: [],
    successMessage: "",
  });
};

// Show login page
exports.getLogin = (req, res) => {
  res.render("auth/login", {
    pageTitle: "Login",
    oldInput: { email: "" },
    errors: [],
    successMessage: "",
  });
};

// Show OTP page
exports.getOTPPage = (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.redirect("/signup");
  }

  res.render("auth/otp", {
    pageTitle: "Verify OTP",
    email,
    errors: [],
    successMessage: "",
  });
};

// ============================================
// FORM SUBMISSIONS (POST)
// ============================================

// Handle signup (step 1: form + send OTP)
exports.postSignup = async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  const errors = [];

  // Validate all fields
  const nameError = validateName(name);
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
      oldInput: { name, email },
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
      name,
      email,
      password, // plain password
      createdAt: Date.now(),
    };

    console.log("Session signupData set at signup:", req.session.signupData);

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

    console.log("OTP generated and sent to:", email);

    // Send OTP email
    try {
      await sendOTPEmail(email, otpCode);
      console.log("sendOTPEmail resolved for:", email);
    } catch (emailErr) {
      console.error("Error sending OTP email:", emailErr);
      return res.status(500).render("auth/signup", {
        pageTitle: "Sign Up",
        oldInput: { name, email },
        errors: [
          {
            msg: "Could not send verification email. Please try again later.",
          },
        ],
        successMessage: "",
      });
    }

    // Redirect to OTP page
    return res.redirect(`/otp?email=${encodeURIComponent(email)}`);
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
  const { email, password, rememberMe } = req.body;
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
    console.log("LOGIN ATTEMPT body:", {
      email,
      passwordLength: password ? password.length : null,
    });

    // Find user
    const user = await User.findOne({ email });
    console.log(
      "LOGIN DB USER:",
      user
        ? { id: user._id, email: user.email, isVerified: user.isVerified }
        : null
    );

    if (!user) {
      return res.status(401).render("auth/login", {
        pageTitle: "Login",
        oldInput: { email },
        errors: [{ msg: "Invalid email or password" }],
        successMessage: "",
      });
    }

    console.log("LOGIN STORED HASH:", user.password);
    console.log("LOGIN RAW PASSWORD FROM BODY:", password, typeof password);

    // Compare plain password with stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    console.log("LOGIN PASSWORD MATCH?:", isMatch);

    if (!isMatch) {
      return res.status(401).render("auth/login", {
        pageTitle: "Login",
        oldInput: { email },
        errors: [{ msg: "Invalid email or password" }],
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

    // Set session (no JWT for EJS)
    req.session.userId = user._id;
    req.session.user = {
      id: user._id,
      username: user.name,
      email: user.email,
    };

    // One-time success message for SweetAlert on home
    req.session.successMessage = "Login successful! Welcome back.";

    console.log("✅ LOGIN SUCCESS:", email);
    return res.redirect("/");
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
    return res.status(400).render("auth/otp", {
      pageTitle: "Verify OTP",
      email: email || "",
      errors: [{ msg: "Email and OTP are required" }],
      successMessage: "",
    });
  }

  try {
    console.log("VERIFY OTP ATTEMPT:", { email, otp });

    // Find OTP record
    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      console.log("❌ OTP not found");
      return res.status(400).render("auth/otp", {
        pageTitle: "Verify OTP",
        email,
        errors: [
          { msg: "Invalid or expired OTP. Please try again or sign up again." },
        ],
        successMessage: "",
      });
    }

    // Check expiry (5 minutes)
    if (otpRecord.expiresAt < new Date()) {
      console.log("❌ OTP expired");
      await OTP.deleteMany({ email });
      return res.status(400).render("auth/otp", {
        pageTitle: "Verify OTP",
        email,
        errors: [
          {
            msg: "OTP has expired. Please sign up again to get a new OTP.",
          },
        ],
        successMessage: "",
      });
    }

    // Get signup data from session
    const signupData = req.session.signupData;
    console.log("Session signupData at verify:", signupData);

    if (!signupData || signupData.email !== email) {
      console.log("❌ Session data mismatch");
      return res.status(400).render("auth/otp", {
        pageTitle: "Verify OTP",
        email,
        errors: [
          {
            msg: "Session expired. Please sign up again to get a new OTP.",
          },
        ],
        successMessage: "",
      });
    }

    // Create or update user (hash password here, no pre-save hook)
    let user = await User.findOne({ email });

    const hashedPassword = await bcrypt.hash(signupData.password, 10);

    if (!user) {
      user = new User({
        name: signupData.name,
        email: signupData.email,
        password: hashedPassword, // store hash directly
        isVerified: true,
      });
      await user.save();
      console.log("✅ User created at verify (password hashed):", user.email);
    } else {
      user.password = hashedPassword;
      user.isVerified = true;
      await user.save();
      console.log(
        "✅ Existing user marked verified (password updated):",
        user.email
      );
    }

    // Delete OTPs
    await OTP.deleteMany({ email });

    // Clear signup session data
    delete req.session.signupData;

    // Set session (auto-login after OTP)
    req.session.userId = user._id;
    req.session.user = {
      id: user._id,
      username: user.name,
      email: user.email,
    };

    // One-time success message for SweetAlert on home
    req.session.successMessage =
      "Account created and verified successfully! Welcome to Footwear.";

    console.log("✅ User verified and logged in:", email);

    // Redirect to home
    return res.redirect("/");
  } catch (err) {
    console.error("❌ OTP verify error:", err);
    return res.status(500).render("auth/otp", {
      pageTitle: "Verify OTP",
      email,
      errors: [{ msg: "Something went wrong. Please try again." }],
      successMessage: "",
    });
  }
};

// Logout
exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/");
  });
};
