const Cart = require("../models/Cart");
const Address = require("../models/Address");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Coupon = require("../models/Coupon");

const getCheckout = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect("/login");
    }

    const userId = req.session.userId;

    // Fetch Cart
    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    // Fetch Addresses and sort default first
    let addresses = await Address.find({ user_id: userId });
    addresses.sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      return 0;
    });

    // Calculate Totals
    let subtotal = 0;
    let originalTotal = 0;
    let totalDiscount = 0;
    let cartItems = [];
    let hasUnavailable = false;

    cartItems = cart.items.map((item) => {
      const product = item.productId;
      let stockStatus = "Available";
      let regularPrice = item.price;
      let salePrice = item.price;

      if (!product || product.isDeleted || product.isBlocked) {
        stockStatus = "Unavailable";
        hasUnavailable = true;
      } else {
        // Check specific variant stock
        const variant = product.variants.find(
          (v) => v.color === item.variantId,
        );
        if (variant && !variant.isBlocked) {
          const sizeObj = variant.sizes.find((s) => s.size == item.size);
          if (sizeObj && sizeObj.status !== "Inactive") {
            regularPrice = sizeObj.regularPrice || item.price;
            salePrice = sizeObj.salePrice || item.price;
            if (sizeObj.quantity < item.quantity) {
              stockStatus = "Out of Stock";
              hasUnavailable = true;
            }
          } else {
            stockStatus = "Unavailable";
            hasUnavailable = true;
          }
        } else {
          stockStatus = "Unavailable";
          hasUnavailable = true;
        }
      }

      let itemDiscount = (regularPrice - salePrice) * item.quantity;
      if (itemDiscount < 0) itemDiscount = 0;

      totalDiscount += itemDiscount;
      originalTotal += regularPrice * item.quantity;
      subtotal += item.price * item.quantity;
      return { ...item.toObject(), regularPrice, salePrice, stockStatus };
    });

    if (hasUnavailable) {
      // Optional: Flash message "Some items are unavailable"
    }

    // Fetch active coupons
    const activeCoupons = await Coupon.find({ isActive: true, expiresAt: { $gt: new Date() } });

    // Handle applied coupon
    let appliedCoupon = req.session.appliedCoupon || null;
    let couponDiscountAmount = 0;

    if (appliedCoupon) {
      if (subtotal >= appliedCoupon.minPurchaseAmount) {
        if (appliedCoupon.discountType === 'Percentage') {
          couponDiscountAmount = (subtotal * appliedCoupon.discountValue) / 100;
        } else {
          couponDiscountAmount = appliedCoupon.discountValue;
        }
      } else {
        // Subtotal dropped below minimum, remove coupon automatically
        req.session.appliedCoupon = null;
        appliedCoupon = null;
      }
    }

    // Hardcoded for now, can be dynamic
    const shippingFee = 0;
    const tax = 0;
    let total = subtotal - couponDiscountAmount + shippingFee + tax;
    if (total < 0) total = 0;

    let wallet = await Wallet.findOne({ userId });
    const walletBalance = wallet ? wallet.balance : 0;

    res.render("user/checkout", {
      pageTitle: "Checkout",
      cartItems,
      subtotal,
      originalTotal,
      totalDiscount,
      shippingFee,
      tax,
      total,
      addresses,
      user: req.user,
      hasUnavailable,
      walletBalance,
      activeCoupons,
      appliedCoupon,
      couponDiscountAmount,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
    console.log("DEBUG: Razorpay Key ID loaded as:", process.env.RAZORPAY_KEY_ID ? (process.env.RAZORPAY_KEY_ID.substring(0, 5) + "...") : "MISSING");
  } catch (error) {
    console.error("Checkout Page Error:", error);
    res.redirect("/cart");
  }
};

const placeOrder = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    const userId = req.session.userId;
    const { addressId, paymentMethod } = req.body;

    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        return res
          .status(400)
          .json({ success: false, message: "Wallet not found." });
      }
    }

    if (!addressId) {
      return res
        .status(400)
        .json({ success: false, message: "Please select a shipping address" });
    }

    // Fetch Cart
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // Fetch Address
    const address = await Address.findById(addressId);
    if (!address) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address" });
    }

    // Final Stock Validation & Order Items Construction
    let orderItems = [];
    let subtotal = 0;

    for (const item of cart.items) {
      // Check if product reference exists
      if (!item.productId) {
        return res
          .status(400)
          .json({ success: false, message: `Cart contains invalid product.` });
      }

      const product = await Product.findById(item.productId._id); // Re-fetch to be safe

      if (!product || product.isDeleted || product.isBlocked) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.productName} is unavailable`,
        });
      }

      const variant = product.variants.find((v) => v.color === item.variantId);
      if (!variant || variant.isBlocked) {
        console.log(
          `Variant not found or blocked: ${item.variantId} in product ${product._id}`,
        );
        return res.status(400).json({
          success: false,
          message: `Variant unavailable for ${item.productName}`,
        });
      }

      const sizeObj = variant.sizes.find((s) => s.size == item.size);
      if (
        !sizeObj ||
        sizeObj.status === "Inactive" ||
        sizeObj.quantity < item.quantity
      ) {
        console.log(
          `Insufficient stock or inactive: Size ${item.size}, Req: ${item.quantity}, Avail: ${sizeObj ? sizeObj.quantity : "None"}`,
        );
        return res.status(400).json({
          success: false,
          message: `Insufficient stock or unavailable for ${item.productName} (${item.size})`,
        });
      }

      // Deduct Stock
      sizeObj.quantity -= item.quantity;

      // Validate image existence logic if needed, but keeping it simple
      await product.save();

      subtotal += item.price * item.quantity;

      orderItems.push({
        productId: product._id,
        productName: product.productName,
        variantId: item.variantId,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        itemTotal: item.price * item.quantity,
        image: item.image,
        finalPricePaid: item.price * item.quantity,
      });
    }

    // Calculate Finals
    const shippingFee = 0;
    const tax = 0;
    let couponDiscountAmount = 0;
    let appliedCoupon = req.session.appliedCoupon || null;

    if (appliedCoupon) {
      if (subtotal >= appliedCoupon.minPurchaseAmount) {
        if (appliedCoupon.discountType === 'Percentage') {
          couponDiscountAmount = (subtotal * appliedCoupon.discountValue) / 100;
        } else {
          couponDiscountAmount = appliedCoupon.discountValue;
        }
      } else {
        req.session.appliedCoupon = null;
        appliedCoupon = null;
      }
    }

    let totalAmount = subtotal - couponDiscountAmount + shippingFee + tax;
    if (totalAmount < 0) totalAmount = 0;

    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < totalAmount) {
         return res.status(400).json({ success: false, message: "Insufficient Wallet Balance. Please try another payment method." });
      }
      wallet.balance -= totalAmount;
      if (!wallet.transactions) wallet.transactions = [];
      wallet.transactions.push({
        amount: totalAmount,
        type: "Debit",
        description: "Paid for Order",
        date: new Date(),
      });
      await wallet.save();
    }

    // Create Order
    const newOrder = new Order({
      userId,
      items: orderItems,
      totalAmount,
      shippingAddress: {
        full_name: req.user
          ? req.user.full_name
          : req.session.user
            ? req.session.user.name
            : "User",
        phone_number: address.phone_number,
        full_address: address.full_address,
        city: address.city,
        state: address.state,
        country: address.country,
        zip_code: address.zip_code,
      },
      paymentMethod: "COD", // Force COD per requirement
      paymentStatus: "Pending",
      orderStatus: "Ordered",
      shippingFee,
      tax,
      paymentMethod: paymentMethod, // Instead of hardcoded 'COD'
      paymentStatus: paymentMethod === "Wallet" ? "Completed" : "Pending", // Mark paid immediately!
      discountAmount: couponDiscountAmount, // Save discount applied
      couponCode: appliedCoupon ? appliedCoupon.code : null
    });

    await newOrder.save();

    // Increment coupon usage
    if (appliedCoupon) {
      const dbCoupon = await Coupon.findById(appliedCoupon._id);
      if (dbCoupon) {
        dbCoupon.usedCount += 1;
        dbCoupon.usedBy.push(userId);
        await dbCoupon.save();
      }
      req.session.appliedCoupon = null; // Clear from session after order
    }

    // Clear Cart
    cart.items = [];
    await cart.save();

    res.json({ success: true, orderId: newOrder._id });
  } catch (error) {
    console.error("Place Order Error:", error);
    res.status(500).json({ success: false, message: "Failed to place order" });
  }
};

const getOrderSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId);

    if (!order) return res.redirect("/");

    res.render("user/order-success", {
      pageTitle: "Order Confirmed",
      order,
      user: req.user,
    });
  } catch (error) {
    console.error("Order Success Error:", error);
    res.redirect("/");
  }
};

const getOrderFailure = async (req, res) => {
  try {
    res.render("user/order-failure", {
      pageTitle: "Payment Failed",
      user: req.user,
    });
  } catch (error) {
    console.error("Order Failure Error:", error);
    res.redirect("/");
  }
};

// Add Address Inline (if needed, or reuse profile route)
const addAddress = async (req, res) => {
  try {
    const { full_address, city, state, country, zip_code, phone_number } =
      req.body;
    const userId = req.session.userId;

    const newAddress = new Address({
      user_id: userId,
      full_address,
      city,
      state,
      country,
      zip_code,
      phone_number,
    });

    await newAddress.save();
    res.json({ success: true, message: "Address added", address: newAddress });
  } catch (error) {
    console.error("Add Address Error:", error);
    res.status(500).json({ success: false, message: "Failed to add address" });
  }
};

// Apply Coupon
const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.userId;

    if (!couponCode) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a coupon code." });
    }

    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

    if (!coupon) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid coupon code." });
    }

    if (!coupon.isActive || new Date() > coupon.expiresAt) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon is expired or inactive." });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon usage limit reached." });
    }

    if (coupon.usedBy.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You have already used this coupon.",
      });
    }

    // We must calculate current subtotal to check min purchase requirement
    const Cart = require("../models/Cart");
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    let subtotal = 0;
    if (cart && cart.items) {
      for (const item of cart.items) {
        subtotal += item.price * item.quantity;
      }
    }

    if (subtotal < coupon.minPurchaseAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchaseAmount} required.`,
      });
    }

    // Save valid coupon strictly in session!
    req.session.appliedCoupon = {
      _id: coupon._id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minPurchaseAmount: coupon.minPurchaseAmount
    };

    res.json({ success: true, message: "Coupon applied successfully!" });
  } catch (error) {
    console.error("Apply Coupon Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to apply coupon." });
  }
};

// Remove Coupon
const removeCoupon = async (req, res) => {
  try {
    req.session.appliedCoupon = null; // Clear from session
    res.json({ success: true, message: "Coupon removed." });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to remove coupon." });
  }
};

module.exports = {
  getCheckout,
  placeOrder,
  getOrderSuccess,
  getOrderFailure,
  addAddress,
  applyCoupon,
  removeCoupon,
};
