const Wallet = require("../models/Wallet");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Render the Wallet Page
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find existing wallet or create an empty one if it's their first time
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({
        userId: userId,
        balance: 0,
        transactions: [],
      });
      await wallet.save();
    }

    // Sort transactions to show newest first
    wallet.transactions.sort((a, b) => b.date - a.date);

    res.render("user/wallet", {
      pageTitle: "My Wallet",
      activeMenu: "profile", // keeps the sidebar highlighted correctly
      wallet: wallet,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Wallet Error:", error);
    res.status(500).render("error", { message: "Failed to load wallet" });
  }
};

// Create Razorpay Order for Wallet Top-up
exports.createWalletOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const options = {
      amount: Math.round(amount * 100), // amount in paise
      currency: "INR",
      receipt: `wallet_topup_${Date.now()}`,
    };

    const razorpayOrder = await instance.orders.create(options);
    res.json({
      success: true,
      order: razorpayOrder,
    });
  } catch (error) {
    console.error("Create Wallet Order Error:", error);
    res.status(500).json({ success: false, message: "Failed to initialize payment." });
  }
};

// Verify Wallet Payment and Update Balance
exports.verifyWalletPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const userId = req.user ? req.user._id : null;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    // Verify signature
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // Update wallet balance and record transaction
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0, transactions: [] });
    }

    const topUpAmount = parseFloat(amount);
    wallet.balance += topUpAmount;
    wallet.transactions.push({
      amount: topUpAmount,
      type: "Credit",
      description: "Wallet Top-up via Razorpay",
      date: new Date(),
    });

    await wallet.save();

    res.json({ success: true, message: "Wallet topped up successfully!" });
  } catch (error) {
    console.error("Verify Wallet Payment Error:", error);
    res.status(500).json({ success: false, message: "Server error during payment verification." });
  }
};
