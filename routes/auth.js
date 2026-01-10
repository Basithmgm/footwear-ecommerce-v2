const express = require("express");
const router = express.Router();
const User = require("../models/User");
const OTP = require("../models/OTP");
const { sendOTPEmail } = require("../services/emailService");

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// SIGNUP - Step 1: Generate and send OTP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // Validation
    if (!name || !email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Password must be at least 6 characters",
        });
    }
    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }

    const lowerEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: lowerEmail });
    if (existingUser && existingUser.isVerified) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Email already registered. Please sign in.",
        });
    }

    // Remove old unverified user
    if (existingUser && !existingUser.isVerified) {
      await User.deleteOne({ _id: existingUser._id });
    }

    // Generate OTP
    const otp = generateOTP();

    // Remove old OTPs
    await OTP.deleteMany({ email: lowerEmail });

    // Save new OTP
    await OTP.create({
      email: lowerEmail,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    // Send OTP email
    try {
      await sendOTPEmail(email, otp);
      console.log("✅ OTP sent to:", email);
    } catch (emailError) {
      console.error("Email error:", emailError);
      await OTP.deleteMany({ email: lowerEmail });
      return res
        .status(500)
        .json({
          success: false,
          message: "Failed to send OTP. Please try again.",
        });
    }

    // Store signup data in session (PLAIN password - will be hashed by User model)
    req.session.signupData = {
      name,
      email: lowerEmail,
      password, // ✅ Store PLAIN password
      createdAt: Date.now(),
    };

    console.log("Session signupData set at signup");

    res.json({
      success: true,
      message: "OTP sent to your email.",
      email: lowerEmail,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "An error occurred. Please try again.",
      });
  }
});

// VERIFY OTP - Step 2: Verify OTP and Create Account
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });
    }

    const lowerEmail = email.toLowerCase();

    // Check OTP
    const otpRecord = await OTP.findOne({ email: lowerEmail, otp });

    if (!otpRecord) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    // Check expiry
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteMany({ email: lowerEmail });
      return res
        .status(400)
        .json({
          success: false,
          message: "OTP has expired. Please request a new one.",
        });
    }

    // Get signup data from session
    const signupData = req.session.signupData;

    if (!signupData || signupData.email !== lowerEmail) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Session expired. Please sign up again.",
        });
    }

    // Create user - Password will be hashed by pre-save hook
    let user = await User.findOne({ email: lowerEmail });

    if (!user) {
      user = new User({
        name: signupData.name,
        email: lowerEmail,
        password: signupData.password, // ✅ PLAIN password - User model will hash it
        isVerified: true,
      });
      await user.save(); // ← pre-save hook hashes password here
      console.log("✅ User created:", user.email);
    } else {
      user.password = signupData.password; // ✅ PLAIN password
      user.isVerified = true;
      await user.save(); // ← pre-save hook hashes password here
      console.log("✅ User updated:", user.email);
    }

    // Clean up
    await OTP.deleteOne({ _id: otpRecord._id });
    delete req.session.signupData;

    // Create session
    req.session.userId = user._id;
    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
    };

    console.log("✅ User verified and logged in:", user.email);

    res.json({
      success: true,
      message: "Email verified successfully!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      redirectUrl: "/",
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "An error occurred during verification",
      });
  }
});

// RESEND OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const lowerEmail = email.toLowerCase();

    // Check session
    const signupData = req.session.signupData;
    if (!signupData || signupData.email !== lowerEmail) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Session expired. Please sign up again.",
        });
    }

    // Generate new OTP
    const otp = generateOTP();

    // Remove old OTP
    await OTP.deleteMany({ email: lowerEmail });

    // Save new OTP
    await OTP.create({
      email: lowerEmail,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // Send OTP
    try {
      await sendOTPEmail(email, otp);
      console.log("✅ OTP resent to:", email);
    } catch (emailError) {
      await OTP.deleteMany({ email: lowerEmail });
      return res
        .status(500)
        .json({ success: false, message: "Failed to resend OTP." });
    }

    res.json({
      success: true,
      message: "OTP resent to your email",
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ success: false, message: "Failed to resend OTP" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const lowerEmail = email.toLowerCase();

    // Find user
    const user = await User.findOne({ email: lowerEmail });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Check verification
    if (!user.isVerified) {
      return res
        .status(403)
        .json({ success: false, message: "Please verify your email first." });
    }

    // Compare password with bcrypt
    const bcrypt = require("bcryptjs");
    const isPasswordValid = await bcrypt.compare(password, user.password);

    console.log("LOGIN ATTEMPT:", { email, passwordMatch: isPasswordValid });

    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Set session
    req.session.userId = user._id;
    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
    };

    console.log("✅ User logged in:", user.email);

    res.json({
      success: true,
      message: "Logged in successfully!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      redirectUrl: "/",
    });
  } catch (error) {
    console.error("Login error:", error);
    res
      .status(500)
      .json({ success: false, message: "An error occurred during login" });
  }
});

// LOGOUT
// router.post('/logout', (req, res) => {
//     req.session.destroy(err => {
//         if (err) {
//             return res.status(500).json({ success: false, message: 'Failed to logout' });
//         }
//         res.clearCookie('rememberMe');
//         res.json({ success: true, message: 'Logged out successfully', redirectUrl: '/' });
//     });
// });

// GET USER
router.get("/user", (req, res) => {
  if (!req.session.user) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  }
  res.json({ success: true, user: req.session.user });
});

module.exports = router;
