const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');

const getCart = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect('/login');
        }

        const cart = await Cart.findOne({ userId: req.session.userId })
            .populate({
                path: 'items.productId',
                model: 'Product'
            });

        // Calculate totals
        let subtotal = 0;
        let originalTotal = 0;
        let totalDiscount = 0;
        let cartItems = [];

        if (cart && cart.items.length > 0) {
            cartItems = cart.items.map(item => {
                // Determine current price from product variant/size
                const product = item.productId;
                let currentPrice = item.price;
                let stockStatus = 'Available';
                let regularPrice = item.price;
                let salePrice = item.price;
                let maxStock = 0;

                // Find the exact variant and size
                if (!product || product.isDeleted || product.isBlocked) {
                    stockStatus = 'Unavailable';
                } else {
                    const variant = product.variants.find(v => v.color === item.variantId);
                    if (variant) {
                        const sizeObj = variant.sizes.find(s => s.size == item.size);
                        if (sizeObj) {
                            regularPrice = sizeObj.regularPrice || item.price;
                            salePrice = sizeObj.salePrice || item.price;
                            if (sizeObj.quantity <= 0 || sizeObj.quantity < item.quantity) {
                                stockStatus = 'Out of Stock';
                            }
                        } else {
                            stockStatus = 'Unavailable';
                        }
                    } else {
                        stockStatus = 'Unavailable';
                    }
                }

                let itemDiscount = (regularPrice - salePrice) * item.quantity;
                if (itemDiscount < 0) itemDiscount = 0;

                totalDiscount += itemDiscount;
                originalTotal += regularPrice * item.quantity;
                subtotal += item.price * item.quantity;

                return {
                    ...item.toObject(),
                    regularPrice,
                    salePrice,
                    subtotal: item.price * item.quantity,
                    stockStatus
                };
            });
        }

        res.render('user/cart', {
            cartItems,
            subtotal,
            originalTotal,
            totalDiscount,
            user: req.session.user,
            pageTitle: 'My Cart'
        });

    } catch (error) {
        console.error('Get Cart Error:', error);
        res.render('user/cart', {
            cartItems: [],
            subtotal: 0,
            originalTotal: 0,
            totalDiscount: 0,
            user: req.session.user,
            pageTitle: 'My Cart',
            error: 'Failed to load cart'
        });
    }
};

const addToCart = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'Please login to add items to cart' });
        }

        const { productId, variantColor, size, quantity, price } = req.body;
        const userId = req.session.userId;

        // 1. Validate Product & Stock
        const product = await Product.findById(productId);
        if (!product || product.isDeleted || product.isBlocked) {
            return res.status(404).json({ success: false, message: 'Product not found or unavailable' });
        }

        // Find specific size variant
        const variant = product.variants.find(v => v.color === variantColor);
        if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

        const sizeObj = variant.sizes.find(s => s.size == size);
        if (!sizeObj) return res.status(404).json({ success: false, message: 'Size not found' });

        if (sizeObj.quantity < quantity) {
            return res.status(400).json({ success: false, message: 'Insufficient stock' });
        }

        // 2. Find or Create Cart
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        console.log("Add to Cart Request Body:", req.body);
        console.log("Current Cart Items (before check):", cart.items.map(i => ({ pid: i.productId, vid: i.variantId, sz: i.size })));

        // 3. Check if item exists
        const existingItemIndex = cart.items.findIndex(item => {
            const isSameProduct = item.productId.toString() === productId;
            const isSameVariant = item.variantId === variantColor; // Ensure exact match
            const isSameSize = item.size.toString() === size.toString(); // Ensure string comparison

            console.log(`Checking Item: ${item._id} | SameProd: ${isSameProduct} | SameVar: ${isSameVariant} ('${item.variantId}' vs '${variantColor}') | SameSize: ${isSameSize} ('${item.size}' vs '${size}')`);

            return isSameProduct && isSameVariant && isSameSize;
        });

        if (existingItemIndex > -1) {
            // Update Quantity
            let newQuantity = cart.items[existingItemIndex].quantity + parseInt(quantity);

            // Max limit + Stock check
            if (newQuantity > 5) return res.status(400).json({ success: false, message: 'Maximum 5 items per product allowed' });
            if (newQuantity > sizeObj.quantity) return res.status(400).json({ success: false, message: 'Insufficient stock for requested quantity' });

            cart.items[existingItemIndex].quantity = newQuantity;
        } else {
            // Add new Item
            cart.items.push({
                productId,
                variantId: variantColor,
                size,
                quantity: parseInt(quantity),
                price: parseFloat(price),
                productName: product.productName,
                image: variant.variantImages[0]
            });
        }

        await cart.save();

        // 4. Remove from Wishlist
        await User.findByIdAndUpdate(userId, {
            $pull: { wishlist: productId }
        });

        const totalQuantity = cart.items.reduce((acc, item) => acc + item.quantity, 0);

        res.json({ success: true, message: 'Added to cart successfully', cartCount: totalQuantity });

    } catch (error) {
        console.error('Add to Cart Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateQuantity = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { itemId, check } = req.body; // 'check' is 'plus' or 'minus'
        const userId = req.session.userId;

        const cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        const item = cart.items.id(itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found in cart' });

        // Logic check
        // ideally we fetch product again to verify stock
        const product = await Product.findById(item.productId);

        // Handle case where product might be deleted or not found
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found (might be deleted)' });
        }

        const variant = product.variants.find(v => v.color === item.variantId);
        if (!variant) {
            return res.status(404).json({ success: false, message: 'Variant not found' });
        }

        const sizeObj = variant.sizes.find(s => s.size == item.size);
        if (!sizeObj) {
            return res.status(404).json({ success: false, message: 'Size not found' });
        }

        let newQuantity = item.quantity;

        if (check === 'plus') {
            newQuantity += 1;
            if (newQuantity > 5) return res.json({ success: false, message: 'Max limit reached (5)' });
            if (newQuantity > sizeObj.quantity) return res.json({ success: false, message: 'Out of stock' });
        } else if (check === 'minus') {
            newQuantity -= 1;
        }

        if (newQuantity < 1) {
            // Remove item if quantity matches < 1 (optional, user might prefer explicit remove btn)
            // But usually '-' stops at 1.
            return res.json({ success: false, message: 'Minimum quantity is 1' });
        }

        item.quantity = newQuantity;

        // Ensure we save the parent document (cart), not the subdocument (item)
        await cart.save();

        // Calculate new totals for response
        const cartForTotals = await Cart.findOne({ userId }).populate('items.productId');
        let total = 0, originalTotal = 0, totalDiscount = 0;
        const totalQuantity = cartForTotals.items.reduce((acc, item) => acc + item.quantity, 0);

        cartForTotals.items.forEach(curr => {
            let regularPrice = curr.price;
            let salePrice = curr.price;
            const p = curr.productId;
            if (p) {
                const v = p.variants.find(v => v.color === curr.variantId);
                if (v) {
                    const s = v.sizes.find(sz => sz.size == curr.size);
                    if (s) {
                        regularPrice = s.regularPrice || curr.price;
                        salePrice = s.salePrice || curr.price;
                    }
                }
            }
            let itemDisc = (regularPrice - salePrice) * curr.quantity;
            if (itemDisc < 0) itemDisc = 0;
            totalDiscount += itemDisc;
            originalTotal += regularPrice * curr.quantity;
            total += curr.price * curr.quantity;
        });

        res.json({
            success: true,
            newQuantity,
            newItemTotal: item.price * newQuantity,
            cartTotal: total,
            originalTotal,
            totalDiscount,
            cartCount: totalQuantity
        });

    } catch (error) {
        console.error('Update Quantity Error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

const removeFromCart = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { itemId } = req.body;
        const userId = req.session.userId;

        const cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        // Remove item using Mongoose pull
        cart.items.pull({ _id: itemId });
        await cart.save();

        const cartForTotals = await Cart.findOne({ userId }).populate('items.productId');
        let total = 0, originalTotal = 0, totalDiscount = 0;
        const totalQuantity = cartForTotals.items.reduce((acc, item) => acc + item.quantity, 0);

        cartForTotals.items.forEach(curr => {
            let regularPrice = curr.price;
            let salePrice = curr.price;
            const p = curr.productId;
            if (p) {
                const v = p.variants.find(v => v.color === curr.variantId);
                if (v) {
                    const s = v.sizes.find(sz => sz.size == curr.size);
                    if (s) {
                        regularPrice = s.regularPrice || curr.price;
                        salePrice = s.salePrice || curr.price;
                    }
                }
            }
            let itemDisc = (regularPrice - salePrice) * curr.quantity;
            if (itemDisc < 0) itemDisc = 0;
            totalDiscount += itemDisc;
            originalTotal += regularPrice * curr.quantity;
            total += curr.price * curr.quantity;
        });

        res.json({ success: true, message: 'Item removed', cartTotal: total, originalTotal, totalDiscount, cartCount: totalQuantity });

    } catch (error) {
        console.error('Remove Cart Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const getCartCount = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.json({ success: true, cartCount: 0 });
        }
        const cart = await Cart.findOne({ userId: req.session.userId });
        let count = 0;
        if (cart && cart.items) {
            count = cart.items.reduce((acc, item) => acc + item.quantity, 0);
        }
        res.json({ success: true, cartCount: count });
    } catch (error) {
        console.error('Get Cart Count Error:', error);
        res.status(500).json({ success: false, cartCount: 0 });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    getCartCount
};
