const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const Coupon = require("../models/Coupon");

const getEffectivePrice = (basePrice, product) => {
  const pOption = { type: product.offerType || 'Percentage', value: product.offerValue || 0 };
  const cOptionDirect = product.category ? { type: product.category.offerType || 'Percentage', value: product.category.offerValue || 0 } : null;
  const cOptionParent = product.category && product.category.parentCategory ? { type: product.category.parentCategory.offerType || 'Percentage', value: product.category.parentCategory.offerValue || 0 } : null;

  const getBestPrice = (price, offers) => {
    let bestPrice = price;
    offers.forEach(opt => {
      if (!opt || opt.value <= 0) return;
      const discount = opt.type === 'Percentage' ? (price * (opt.value / 100)) : opt.value;
      if (discount > price * 0.5) return;
      const discounted = price - discount;
      if (discounted < bestPrice) bestPrice = discounted;
    });
    return Math.round(bestPrice);
  };

  return getBestPrice(basePrice, [pOption, cOptionDirect, cOptionParent]);
};

const calculateCartTotals = (items) => {
  let subtotal = 0;
  let originalTotal = 0;
  let totalDiscount = 0;
  
  const processedItems = items.map(item => {
    const product = item.productId;
    let regularPrice = item.regularPrice || item.price || 0;
    let currentEffectivePrice = item.salePrice || item.price || 0;
    let stockStatus = "Available";

    if (!product || product.isDeleted || product.isBlocked) {
      stockStatus = "Unavailable";
    } else {
      const variant = product.variants.find(v => v.color === item.variantId);
      if (variant && !variant.isBlocked) {
        const sizeObj = variant.sizes.find(s => s.size == item.size);
        if (sizeObj && sizeObj.status !== "Inactive") {
          regularPrice = sizeObj.regularPrice;
          const salePrice = sizeObj.salePrice;
          currentEffectivePrice = getEffectivePrice(salePrice, product);

          if (sizeObj.quantity <= 0) {
            stockStatus = "Out of Stock";
          }
        } else {
          stockStatus = "Unavailable";
        }
      } else {
        stockStatus = "Unavailable";
      }
    }

    let itemDiscount = (regularPrice - currentEffectivePrice) * item.quantity;
    if (itemDiscount < 0) itemDiscount = 0;

    // Calculate totals for ALL items (Simplified flow)
    totalDiscount += itemDiscount;
    originalTotal += regularPrice * item.quantity;
    subtotal += currentEffectivePrice * item.quantity;

    const discountPercentage = regularPrice > currentEffectivePrice 
      ? Math.round(((regularPrice - currentEffectivePrice) / regularPrice) * 100) 
      : 0;

    return {
      ...item.toObject(),
      regularPrice,
      salePrice: currentEffectivePrice,
      discountPercentage,
      subtotal: currentEffectivePrice * item.quantity,
      stockStatus
    };
  });

  return { processedItems, subtotal, originalTotal, totalDiscount };
};

const getCart = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect("/login");
    }

    let cart = await Cart.findOne({ userId: req.session.userId }).populate({
      path: "items.productId",
      populate: {
        path: "category",
        populate: { path: "parentCategory" }
      }
    });

    // PERSISTENCE: If there's a pending Virtual Buy Now, move it to the real cart before displaying
    const virtualItem = req.session.buyNowItem;
    if (virtualItem) {
        if (!cart) {
            cart = new Cart({ userId: req.session.userId, items: [] });
        }
        
        const existingItemIndex = cart.items.findIndex(i => {
            const iId = (i.productId._id || i.productId).toString();
            const vId = (virtualItem.productId._id || virtualItem.productId).toString();
            return iId === vId && 
                   i.variantId === virtualItem.variantId &&
                   i.size.toString() === virtualItem.size.toString();
        });

        if (existingItemIndex === -1) {
            cart.items.push({ ...virtualItem });
        }
        
        await cart.save();
        delete req.session.buyNowItem;
        return res.redirect("/cart"); 
    }

    delete req.session.buyNowItemId;

    const { processedItems: cartItems, subtotal, originalTotal, totalDiscount } = calculateCartTotals(cart ? cart.items : []);

    const activeCoupons = await Coupon.find({
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    let appliedCoupon = req.session.appliedCoupon || null;
    let couponDiscountAmount = 0;

    if (appliedCoupon) {
      if (subtotal >= appliedCoupon.minPurchaseAmount) {
        if (appliedCoupon.discountType === 'Percentage') {
          couponDiscountAmount = (subtotal * appliedCoupon.discountValue) / 100;
        } else {
          couponDiscountAmount = appliedCoupon.discountValue;
        }

        if (appliedCoupon.discountType === 'Percentage' && appliedCoupon.maxDiscountAmount && couponDiscountAmount > appliedCoupon.maxDiscountAmount) {
          couponDiscountAmount = appliedCoupon.maxDiscountAmount;
        }

        if (couponDiscountAmount > (subtotal * 0.5)) {
          req.session.appliedCoupon = null;
          appliedCoupon = null;
          couponDiscountAmount = 0;
        }
      } else {
        req.session.appliedCoupon = null;
        appliedCoupon = null;
      }
    }

    let finalTotal = subtotal - couponDiscountAmount;
    if (finalTotal < 0) finalTotal = 0;

    res.render("user/cart", {
      cartItems,
      subtotal,
      finalTotal,
      originalTotal,
      totalDiscount,
      activeCoupons,
      appliedCoupon,
      couponDiscountAmount,
      user: req.user,
      pageTitle: "My Cart",
    });
  } catch (error) {
    console.error("Get Cart Error:", error);
    res.render("user/cart", {
      cartItems: [],
      subtotal: 0,
      originalTotal: 0,
      totalDiscount: 0,
      user: req.user,
      pageTitle: "My Cart",
      error: "Failed to load cart",
    });
  }
};

const addToCart = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: "Please login to add items to cart" });
    }

    const { productId, variantColor, size, quantity, isBuyNow } = req.body;
    const userId = req.session.userId;

    const product = await Product.findById(productId);
    if (!product || product.isDeleted || product.isBlocked) {
      return res.status(404).json({ success: false, message: "Product not found or unavailable" });
    }

    const variant = product.variants.find((v) => v.color === variantColor);
    if (!variant || variant.isBlocked)
      return res.status(404).json({ success: false, message: "Variant not found or unavailable" });

    const sizeObj = variant.sizes.find((s) => s.size == size);
    if (!sizeObj || sizeObj.status === "Inactive")
      return res.status(404).json({ success: false, message: "Size not found or unavailable" });

    const orderLimit = variant.orderLimit || 5;

    if (parseInt(quantity) > orderLimit) {
      return res.status(400).json({ success: false, message: `Maximum ${orderLimit} items per product allowed` });
    }

    if (sizeObj.quantity < quantity) {
      return res.status(400).json({ success: false, message: "Insufficient stock" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const regularPrice = sizeObj.regularPrice;
    const salePrice = sizeObj.salePrice;
    const image = (variant.variantImages && variant.variantImages[0]) || "";

    if (isBuyNow) {
      const effectivePrice = getEffectivePrice(salePrice, product);
      req.session.buyNowItem = {
        productId: productId,
        productName: product.productName,
        variantId: variantColor,
        size: size,
        quantity: parseInt(quantity),
        price: effectivePrice,
        regularPrice: regularPrice,
        salePrice: salePrice,
        image: image
      };
      
      return res.json({
        success: true,
        message: "Proceeding to Buy Now...",
        cartCount: (cart ? cart.items.reduce((acc, i) => acc + i.quantity, 0) : 0) + parseInt(quantity)
      });
    }

    const existingItemIndex = cart.items.findIndex((item) => {
      const iId = (item.productId._id || item.productId).toString();
      const pId = productId.toString();
      return iId === pId &&
             item.variantId === variantColor &&
             item.size.toString() === size.toString();
    });

    if (existingItemIndex > -1) {
      let newQuantity = cart.items[existingItemIndex].quantity + parseInt(quantity);
      if (newQuantity > orderLimit) return res.status(400).json({ success: false, message: `Maximum ${orderLimit} items per product allowed` });
      if (newQuantity > sizeObj.quantity) return res.status(400).json({ success: false, message: "Insufficient stock" });

      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].price = salePrice;
      cart.items[existingItemIndex].regularPrice = regularPrice;
      cart.items[existingItemIndex].salePrice = salePrice;
    } else {
      cart.items.push({
        productId,
        variantId: variantColor,
        size,
        quantity: parseInt(quantity),
        price: salePrice,
        regularPrice,
        salePrice,
        productName: product.productName,
        image: image
      });
    }

    await cart.save();
    delete req.session.buyNowItem; 
    delete req.session.buyNowItemId;

    await User.findByIdAndUpdate(userId, {
      $pull: { wishlist: productId },
    });

    const totalQuantity = cart.items.reduce((acc, item) => acc + item.quantity, 0);

    res.json({
      success: true,
      message: "Added to cart successfully",
      cartCount: totalQuantity,
    });
  } catch (error) {
    console.error("Add to Cart Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const updateQuantity = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { itemId, check } = req.body;
    const userId = req.session.userId;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: "Item not found in cart" });

    const product = await Product.findById(item.productId);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const variant = product.variants.find((v) => v.color === item.variantId);
    if (!variant || variant.isBlocked) return res.status(404).json({ success: false, message: "Variant not found or unavailable" });

    const sizeObj = variant.sizes.find((s) => s.size == item.size);
    if (!sizeObj || sizeObj.status === "Inactive") return res.status(404).json({ success: false, message: "Size not found or unavailable" });

    let newQuantity = item.quantity;
    const orderLimit = variant.orderLimit || 5;

    if (check === "plus") {
      newQuantity += 1;
      if (newQuantity > orderLimit) return res.json({ success: false, message: `Max limit reached (${orderLimit})` });
      if (newQuantity > sizeObj.quantity) return res.json({ success: false, message: "Out of stock" });
    } else if (check === "minus") {
      newQuantity -= 1;
    }

    if (newQuantity < 1) return res.json({ success: false, message: "Minimum quantity is 1" });

    item.quantity = newQuantity;
    await cart.save();

    const cartForTotals = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category", populate: { path: "parentCategory" } }
    });

    const { processedItems, subtotal, originalTotal, totalDiscount } = calculateCartTotals(cartForTotals ? cartForTotals.items : []);
    const totalQuantity = processedItems.reduce((acc, i) => acc + i.quantity, 0);
    const updatedItem = processedItems.find(i => i._id.toString() === itemId);

    let appliedCoupon = req.session.appliedCoupon || null;
    let couponDiscountAmount = 0;
    if (appliedCoupon) {
      if (subtotal >= appliedCoupon.minPurchaseAmount) {
        if (appliedCoupon.discountType === 'Percentage') {
          couponDiscountAmount = (subtotal * appliedCoupon.discountValue) / 100;
        } else {
          couponDiscountAmount = appliedCoupon.discountValue;
        }

        if (appliedCoupon.discountType === 'Percentage' && appliedCoupon.maxDiscountAmount && couponDiscountAmount > appliedCoupon.maxDiscountAmount) {
          couponDiscountAmount = appliedCoupon.maxDiscountAmount;
        }

        if (couponDiscountAmount > (subtotal * 0.5)) {
          req.session.appliedCoupon = null;
          appliedCoupon = null;
          couponDiscountAmount = 0;
        }
      } else {
        req.session.appliedCoupon = null;
        appliedCoupon = null;
      }
    }

    res.json({
      success: true,
      newQuantity,
      newItemTotal: updatedItem ? updatedItem.subtotal : 0,
      cartTotal: subtotal,
      originalTotal,
      totalDiscount,
      couponDiscountAmount,
      finalTotal: subtotal - couponDiscountAmount,
      cartCount: totalQuantity,
      couponRemoved: !appliedCoupon && req.session.appliedCoupon === null && couponDiscountAmount === 0
    });
  } catch (error) {
    console.error("Update Quantity Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { itemId } = req.body;
    const userId = req.session.userId;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    cart.items.pull({ _id: itemId });
    await cart.save();

    const cartForTotals = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category", populate: { path: "parentCategory" } }
    });

    const { processedItems, subtotal, originalTotal, totalDiscount } = calculateCartTotals(cartForTotals ? cartForTotals.items : []);
    const totalQuantity = processedItems.reduce((acc, i) => acc + i.quantity, 0);

    let appliedCoupon = req.session.appliedCoupon || null;
    let couponDiscountAmount = 0;
    if (appliedCoupon) {
      if (subtotal >= appliedCoupon.minPurchaseAmount) {
        if (appliedCoupon.discountType === 'Percentage') {
          couponDiscountAmount = (subtotal * appliedCoupon.discountValue) / 100;
        } else {
          couponDiscountAmount = appliedCoupon.discountValue;
        }

        if (appliedCoupon.discountType === 'Percentage' && appliedCoupon.maxDiscountAmount && couponDiscountAmount > appliedCoupon.maxDiscountAmount) {
          couponDiscountAmount = appliedCoupon.maxDiscountAmount;
        }

        if (couponDiscountAmount > (subtotal * 0.5)) {
          req.session.appliedCoupon = null;
          appliedCoupon = null;
          couponDiscountAmount = 0;
        }
      } else {
        req.session.appliedCoupon = null;
        appliedCoupon = null;
      }
    }

    res.json({
      success: true,
      message: "Item removed",
      cartTotal: subtotal,
      originalTotal,
      totalDiscount,
      couponDiscountAmount,
      finalTotal: subtotal - couponDiscountAmount,
      cartCount: totalQuantity,
    });
  } catch (error) {
    console.error("Remove Cart Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getCartCount = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.json({ success: true, cartCount: 0 });
    }
    const cart = await Cart.findOne({ userId: req.session.userId });
    let count = cart ? cart.items.reduce((acc, item) => acc + item.quantity, 0) : 0;
    res.json({ success: true, cartCount: count });
  } catch (error) {
    console.error("Get Cart Count Error:", error);
    res.status(500).json({ success: false, cartCount: 0 });
  }
};


module.exports = {
  getCart,
  addToCart,
  updateQuantity,
  removeFromCart,
  getCartCount,
  calculateCartTotals,
  getEffectivePrice
};
