const { calculateCartTotals: cartHelperTotals, getEffectivePrice } = require("./cartController");
const Cart = require("../models/Cart");
const Address = require("../models/Address");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Coupon = require("../models/Coupon");

// Helper function for calculations (Sync with cartController)
// Use unified logic from cartController (Helper here is kept for minimal impact on other functions if needed, but we'll use the imported one)
const calculateCartTotals = cartHelperTotals;


const getCheckout = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect("/login");

    let cartItems = [];
    let subtotal = 0, originalTotal = 0, totalDiscount = 0, total = 0;
    let appliedCoupon = req.session.appliedCoupon || null;
    let couponDiscountAmount = 0;

    // 1. Determine Source (Virtual or Cart)
    const virtualItemSess = req.session.buyNowItem;
    if (virtualItemSess) {
        const item = {
            ...virtualItemSess,
            _id: "virtual",
            subtotal: virtualItemSess.price * virtualItemSess.quantity,
            stockStatus: "Available"
        };
        cartItems = [item];
        subtotal = item.subtotal;
        originalTotal = virtualItemSess.regularPrice * virtualItemSess.quantity;
        totalDiscount = (virtualItemSess.regularPrice - virtualItemSess.price) * virtualItemSess.quantity;
        total = subtotal;
        // appliedCoupon is allowed for Buy Now (Session carries it over)
        if (appliedCoupon && subtotal >= appliedCoupon.minPurchaseAmount) {
            couponDiscountAmount = appliedCoupon.discountType === 'Percentage' 
              ? Math.min((subtotal * appliedCoupon.discountValue) / 100, appliedCoupon.maxDiscountAmount || Infinity) 
              : appliedCoupon.discountValue;
            if (couponDiscountAmount > subtotal * 0.5) (couponDiscountAmount = 0, appliedCoupon = null, req.session.appliedCoupon = null);
        } else {
            appliedCoupon = null;
        }
        total = subtotal - couponDiscountAmount;
    } else {
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category", populate: { path: "parentCategory" } }
        });
        if (!cart || cart.items.length === 0) return res.redirect("/cart");

        const buyNowIdFilter = req.session.buyNowItemId;
        let itemsToProcess = buyNowIdFilter 
            ? cart.items.filter(i => i.productId && i.productId._id.toString() === buyNowIdFilter.productId && i.variantId === buyNowIdFilter.variantId && i.size.toString() === buyNowIdFilter.size.toString())
            : cart.items;

        if (itemsToProcess.length === 0) return res.redirect("/cart");

        const totals = calculateCartTotals(itemsToProcess);
        cartItems = totals.processedItems;
        subtotal = totals.subtotal;
        originalTotal = totals.originalTotal;
        totalDiscount = totals.totalDiscount;

        if (appliedCoupon && subtotal >= appliedCoupon.minPurchaseAmount) {
            couponDiscountAmount = appliedCoupon.discountType === 'Percentage' 
              ? Math.min((subtotal * appliedCoupon.discountValue) / 100, appliedCoupon.maxDiscountAmount || Infinity) 
              : appliedCoupon.discountValue;
            if (couponDiscountAmount > subtotal * 0.5) (couponDiscountAmount = 0, appliedCoupon = null, req.session.appliedCoupon = null);
        } else {
            appliedCoupon = null;
        }
        total = subtotal - couponDiscountAmount;
    }

    // 2. Fetch Shared Context
    const [addresses, wallet, activeCoupons] = await Promise.all([
        Address.find({ user_id: userId }).sort({ is_default: -1 }),
        Wallet.findOne({ userId }),
        Coupon.find({ isActive: true, expiresAt: { $gt: new Date() } })
    ]);

    // 3. Render
    res.render("user/checkout", {
      pageTitle: "Checkout",
      cartItems,
      subtotal,
      originalTotal,
      totalDiscount,
      total,
      shippingFee: 0,
      tax: 0,
      addresses,
      user: req.user,
      walletBalance: wallet ? wallet.balance : 0,
      activeCoupons,
      appliedCoupon,
      couponDiscountAmount,
      hasUnavailable: cartItems.some(i => i.stockStatus !== 'Available'),
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Checkout Page Error:", error);
    res.redirect("/cart");
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { addressId, paymentMethod } = req.body;

    if (!addressId) return res.status(400).json({ success: false, message: "Address required" });

    // 1. Identify Items
    const virtualItem = req.session.buyNowItem;
    const buyNowCartItem = req.session.buyNowItemId;
    let itemsToProcess = [];

    if (virtualItem) {
        itemsToProcess = [{ ...virtualItem, productId: { _id: virtualItem.productId } }];
    } else {
        const cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart) return res.status(400).json({ success: false, message: "Cart empty" });
        
        if (buyNowCartItem) {
            itemsToProcess = cart.items.filter(item => 
                item.productId && 
                item.productId._id.toString() === buyNowCartItem.productId &&
                item.variantId === buyNowCartItem.variantId &&
                item.size.toString() === buyNowCartItem.size.toString()
            );
        } else {
            // Standard: Use all items in cart
            itemsToProcess = cart.items;
        }
    }

    if (itemsToProcess.length === 0) return res.status(400).json({ success: false, message: "No items selected" });

    // 2. Validate & Deduct Stock
    let orderItems = [];
    let subtotal = 0;

    for (const item of itemsToProcess) {
      const product = await Product.findById(item.productId._id);
      if (!product || product.isDeleted || product.isBlocked) return res.status(400).json({ success: false, message: "Product unavailable" });
      
      const variant = product.variants.find(v => v.color === item.variantId);
      const sizeObj = variant ? variant.sizes.find(s => s.size == item.size) : null;
      
      if (!sizeObj || sizeObj.status === "Inactive" || sizeObj.quantity < item.quantity) {
        return res.status(400).json({ success: false, message: `Stock unavailable for ${item.productName}` });
      }

      sizeObj.quantity -= item.quantity;
      await product.save();

      const price = item.price;
      subtotal += price * item.quantity;

      orderItems.push({
        productId: product._id,
        productName: product.productName,
        variantId: item.variantId,
        size: item.size,
        quantity: item.quantity,
        price,
        itemTotal: price * item.quantity,
        image: item.image,
        finalPricePaid: price * item.quantity // default, adjusted below
      });
    }

    // 3. Discount Logic
    let couponDiscountAmount = 0;
    let appliedCoupon = req.session.appliedCoupon || null;
    if (appliedCoupon) {
        couponDiscountAmount = appliedCoupon.discountType === 'Percentage' 
          ? (subtotal * appliedCoupon.discountValue) / 100 
          : appliedCoupon.discountValue;
        if (appliedCoupon.discountType === 'Percentage' && appliedCoupon.maxDiscountAmount && couponDiscountAmount > appliedCoupon.maxDiscountAmount) {
            couponDiscountAmount = appliedCoupon.maxDiscountAmount;
        }
    }

    // Distribute discount
    if (couponDiscountAmount > 0 && subtotal > 0) {
      let allocated = 0;
      for (let i = 0; i < orderItems.length; i++) {
        if (i === orderItems.length - 1) {
          orderItems[i].finalPricePaid = orderItems[i].itemTotal - (couponDiscountAmount - allocated);
        } else {
          const share = Math.round((orderItems[i].itemTotal / subtotal) * couponDiscountAmount);
          orderItems[i].finalPricePaid = orderItems[i].itemTotal - share;
          allocated += share;
        }
      }
    }

    const totalAmount = subtotal - couponDiscountAmount;
    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < totalAmount) return res.status(400).json({ success: false, message: "Insufficient Wallet Balance" });
      wallet.balance -= totalAmount;
      wallet.transactions.push({ amount: totalAmount, type: "Debit", description: "Order Payment", date: new Date() });
      await wallet.save();
    }

    const address = await Address.findById(addressId);
    const newOrder = new Order({
      userId,
      items: orderItems,
      totalAmount,
      shippingAddress: {
        full_name: req.user ? req.user.full_name : "Customer",
        phone_number: address.phone_number,
        full_address: address.full_address,
        city: address.city,
        state: address.state,
        country: address.country,
        zip_code: address.zip_code
      },
      paymentMethod,
      paymentStatus: paymentMethod === "Wallet" ? "Completed" : "Pending",
      orderStatus: "Ordered",
      discount: couponDiscountAmount,
      couponCode: appliedCoupon ? appliedCoupon.code : null
    });

    await newOrder.save();

    if (appliedCoupon) {
      await Coupon.findByIdAndUpdate(appliedCoupon._id, { $inc: { usedCount: 1 }, $push: { usedBy: userId } });
    }

    // SELECTIVE REMOVAL
    const cart = await Cart.findOne({ userId });
    if (cart) {
      cart.items = cart.items.filter(cartItem => !itemsToProcess.some(fItem => 
        fItem.productId._id.toString() === cartItem.productId.toString() &&
        fItem.variantId === cartItem.variantId &&
        fItem.size.toString() === cartItem.size.toString()
      ));
      await cart.save();
    }

    delete req.session.buyNowItemId;
    delete req.session.buyNowItem;
    req.session.appliedCoupon = null;

    res.json({ success: true, orderId: newOrder._id });
  } catch (error) {
    console.error("Place Order Error:", error);
    res.status(500).json({ success: false, message: "Error placing order" });
  }
};

const handlePaymentFailure = async (req, res) => {
  try {
    const userId = req.session.userId;
    const virtualItem = req.session.buyNowItem;
    const pendingOrderId = req.session.pendingOrderId; // We should set this in createOrder

    // 1. Return Stock if there's a pending order (Razorpay)
    if (pendingOrderId) {
        const order = await Order.findById(pendingOrderId);
        if (order && order.paymentStatus === 'Pending') {
            for (const item of order.items) {
                const product = await Product.findById(item.productId);
                if (product) {
                    const variant = product.variants.find(v => v.color === item.variantId);
                    const sizeObj = variant ? variant.sizes.find(s => s.size == item.size) : null;
                    if (sizeObj) {
                        sizeObj.quantity += item.quantity;
                        await product.save();
                    }
                }
            }
            // Update order status to reflect payment failure
            order.paymentStatus = 'Failed';
            order.orderStatus = 'Payment Failed';
            await order.save();
        }
        delete req.session.pendingOrderId;
    }

    if (virtualItem && userId) {
      let cart = await Cart.findOne({ userId });
      if (!cart) cart = new Cart({ userId, items: [] });
      const index = cart.items.findIndex(i => {
        const iId = (i.productId._id || i.productId).toString();
        const vId = (virtualItem.productId._id || virtualItem.productId).toString();
        return iId === vId && 
               i.variantId === virtualItem.variantId &&
               i.size.toString() === virtualItem.size.toString();
      });
      if (index === -1) {
        cart.items.push({ ...virtualItem, isSelected: true });
      }
      await cart.save();
      delete req.session.buyNowItem;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Failure Handler Error:", error);
    res.status(500).json({ success: false });
  }
};

const getOrderSuccess = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.redirect("/");
    res.render("user/order-success", { pageTitle: "Success", order, user: req.user });
  } catch (error) {
    res.redirect("/");
  }
};

const getOrderFailure = async (req, res) => {
  res.render("user/order-failure", { pageTitle: "Failed", user: req.user });
};

const addAddress = async (req, res) => {
  try {
    const newAddr = new Address({ ...req.body, user_id: req.session.userId });
    await newAddr.save();
    res.json({ success: true, address: newAddr });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

const applyCoupon = async (req, res) => {
    // Basic implementation for stability, can be refined
    try {
        const { couponCode } = req.body;
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
        if(!coupon) return res.status(400).json({ success: false, message: "Invalid coupon" });
        req.session.appliedCoupon = coupon;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

const removeCoupon = async (req, res) => {
    req.session.appliedCoupon = null;
    res.json({ success: true });
};

module.exports = {
  getCheckout,
  placeOrder,
  getOrderSuccess,
  getOrderFailure,
  addAddress,
  applyCoupon,
  removeCoupon,
  handlePaymentFailure
};
