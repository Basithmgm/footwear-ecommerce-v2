const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Address = require("../models/Address");
const Coupon = require("../models/Coupon");

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay Order and Save Pending Order
const createOrder = async (req, res) => {
  try {
    const userId = req.session.userId || req.user?._id;
    const { addressId } = req.body;

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: "Invalid address" });
    }

    // ISOLATION: Priority Filter
    const virtualItem = req.session.buyNowItem;
    const buyNowCartItem = req.session.buyNowItemId;
    let cart = null;
    let filteredCartItems = [];
    let subtotal = 0;

    if (virtualItem) {
        // Virtual checkout: Mocking a cart item structure
        filteredCartItems = [{
            productId: { _id: virtualItem.productId },
            variantId: virtualItem.variantId,
            size: virtualItem.size,
            quantity: virtualItem.quantity,
            price: virtualItem.price,
            productName: virtualItem.productName,
            image: virtualItem.image
        }];
    } else {
        cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart || cart.items.length === 0) return res.status(400).json({ success: false, message: "Cart empty" });

        if (buyNowCartItem) {
            filteredCartItems = cart.items.filter(item => 
                item.productId && 
                item.productId._id.toString() === buyNowCartItem.productId &&
                item.variantId === buyNowCartItem.variantId &&
                item.size.toString() === buyNowCartItem.size.toString()
            );
        } else {
            // Standard: Use all items in cart
            filteredCartItems = cart.items;
        }
    }

    const orderItems = [];

    // Validations & Stock Reservation
    for (const item of filteredCartItems) {
      const product = await Product.findById(item.productId._id);
      if (!product || product.isDeleted || product.isBlocked) {
        return res.status(400).json({ success: false, message: `Product ${item.productName} is unavailable` });
      }
      const variant = product.variants.find((v) => v.color === item.variantId);
      if (!variant || variant.isBlocked) {
        return res.status(400).json({ success: false, message: `Variant unavailable for ${item.productName}` });
      }
      const sizeObj = variant.sizes.find((s) => s.size == item.size);
      if (!sizeObj || sizeObj.status === "Inactive" || sizeObj.quantity < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${item.productName} (${item.size})` });
      }

      // Reserve Stock
      sizeObj.quantity -= item.quantity;
      await product.save();

      const price = item.price; // Use the price from the filtered item (which should have snapshots)
      const itemTotal = price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        productId: item.productId._id,
        productName: product.productName,
        variantId: item.variantId,
        size: item.size,
        quantity: item.quantity,
        price: price,
        itemTotal,
        finalPricePaid: price * item.quantity,
        image: item.image || (variant.variantImages && variant.variantImages[0]) || "",
        itemStatus: "Ordered"
      });
    }

    // Apply Coupon
    let couponDiscountAmount = 0;
    if (req.session.appliedCoupon) {
      const coupon = req.session.appliedCoupon;
      if (subtotal >= coupon.minPurchaseAmount) {
        couponDiscountAmount = coupon.discountType === 'Percentage' 
          ? (subtotal * coupon.discountValue) / 100 
          : coupon.discountValue;
      }
    }
    
    // Proportionally distribute coupon discount across items so returns reflect the actual price paid
    if (couponDiscountAmount > 0 && subtotal > 0 && orderItems.length > 0) {
      let allocatedDiscount = 0;
      for (let i = 0; i < orderItems.length; i++) {
        const item = orderItems[i];
        if (i === orderItems.length - 1) {
          // Last item absorbs any rounding difference to ensure total discount matches exactly
          item.finalPricePaid = Math.max(0, item.itemTotal - (couponDiscountAmount - allocatedDiscount));
        } else {
          const itemProportionalDiscount = Math.round((item.itemTotal / subtotal) * couponDiscountAmount);
          item.finalPricePaid = Math.max(0, item.itemTotal - itemProportionalDiscount);
          allocatedDiscount += itemProportionalDiscount;
        }
      }
    }

    const totalAmount = subtotal - couponDiscountAmount;
    if (isNaN(totalAmount) || totalAmount < 0) {
      return res.status(400).json({ success: false, message: "Invalid order amount" });
    }

    const options = {
      amount: Math.round(totalAmount * 100), // paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const razorpayOrder = await instance.orders.create(options);

    // Save PENDING order in DB
    const newOrder = new Order({
      userId,
      items: orderItems,
      totalAmount,
      paymentMethod: "Razorpay",
      paymentStatus: "Pending",
      orderStatus: "Payment Pending",
      shippingAddress: {
        full_name: req.user ? req.user.full_name : "User",
        phone_number: address.phone_number,
        full_address: address.full_address,
        city: address.city,
        state: address.state,
        country: address.country,
        zip_code: address.zip_code,
      },
      discount: couponDiscountAmount,
    });

    await newOrder.save();
    req.session.pendingOrderId = newOrder._id; // Store for stock recovery on failure

    res.json({ 
      success: true, 
      order: razorpayOrder,
      orderId: newOrder._id, // Internal Order ID
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error("Razorpay Create Order Failure!", err);
    res.status(500).json({ success: false, message: "Failed to initialize order." });
  }
};

// Verify Razorpay Payment and Update Order
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const userId = req.session.userId || (req.user ? req.user._id : null);

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    console.log("--- Razorpay Signature Verification Started ---");
    console.log("Order ID Context:", orderId);
    console.log("Received Signature:", razorpay_signature);
    console.log("Generated Signature:", generatedSignature);

    if (generatedSignature !== razorpay_signature) {
      console.error("❌ Razorpay Signature Mismatch! Verification Failed.");
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    console.log("✅ Razorpay Signature Matched. Updating order records...");

    // Find and Update existing order
    const order = await Order.findById(orderId);
    if (!order) {
      console.error("❌ Order not found in DB:", orderId);
      return res.status(404).json({ success: false, message: "Order records not found" });
    }

    // Update order status
    order.paymentStatus = "Paid";
    order.orderStatus = "Ordered"; // Success status
    await order.save();
    console.log("✅ Order Status Updated to 'Ordered' and 'Paid'");

    // SELECTIVE REMOVAL: Only remove successfully purchased items from the DB cart
    const cart = await Cart.findOne({ userId });
    if (cart) {
        cart.items = cart.items.filter(cartItem => {
            const wasPurchased = order.items.some(oItem => 
                oItem.productId && cartItem.productId && 
                oItem.productId.toString() === cartItem.productId.toString() &&
                oItem.variantId === cartItem.variantId &&
                oItem.size && cartItem.size &&
                oItem.size.toString() === cartItem.size.toString()
            );
            return !wasPurchased;
        });
        await cart.save();
    }

    // Finalize coupon logic if exists
    if (req.session.appliedCoupon) {
      const dbCoupon = await Coupon.findById(req.session.appliedCoupon._id);
      if (dbCoupon) {
        dbCoupon.usedCount += 1;
        dbCoupon.usedBy.push(userId);
        await dbCoupon.save();
      }
    }

    // Clear session flags and cleanup
    delete req.session.buyNowItemId;
    delete req.session.buyNowItem;
    req.session.appliedCoupon = null;

    res.json({ success: true, orderId: order._id });
  } catch (err) {
    console.error("Razorpay Payment Verification Error!", err);
    res.status(500).json({ success: false, message: "Server error during payment verification." });
  }
};

// Retry Razorpay Payment for existing order
const retryPaymentOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.userId || req.user?._id;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Security check: Ensure order belongs to current user
    if (order.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this order" });
    }

    if (order.paymentStatus !== "Pending") {
      return res.status(400).json({ success: false, message: "Order is already paid or cancelled" });
    }

    const options = {
      amount: Math.round(order.totalAmount * 100),
      currency: "INR",
      receipt: `retry_${order._id.toString().slice(-6)}_${Date.now()}`, // Shortened for 40 char limit
    };

    const razorpayOrder = await instance.orders.create(options);

    res.json({
      success: true,
      order: razorpayOrder,
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error("Retry Payment Error:", err);
    res.status(500).json({ success: false, message: "Failed to generate retry payment link" });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  retryPaymentOrder
};
