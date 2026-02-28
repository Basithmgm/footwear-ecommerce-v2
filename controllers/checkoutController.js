const Cart = require('../models/Cart');
const Address = require('../models/Address');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

const getCheckout = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect('/login');
        }

        const userId = req.session.userId;

        // Fetch Cart
        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
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

        cartItems = cart.items.map(item => {
            const product = item.productId;
            let stockStatus = 'Available';
            let regularPrice = item.price;
            let salePrice = item.price;

            if (!product || product.isDeleted || product.isBlocked) {
                stockStatus = 'Unavailable';
                hasUnavailable = true;
            } else {
                // Check specific variant stock
                const variant = product.variants.find(v => v.color === item.variantId);
                if (variant && !variant.isBlocked) {
                    const sizeObj = variant.sizes.find(s => s.size == item.size);
                    if (sizeObj && sizeObj.status !== 'Inactive') {
                        regularPrice = sizeObj.regularPrice || item.price;
                        salePrice = sizeObj.salePrice || item.price;
                        if (sizeObj.quantity < item.quantity) {
                            stockStatus = 'Out of Stock';
                            hasUnavailable = true;
                        }
                    } else {
                        stockStatus = 'Unavailable';
                        hasUnavailable = true;
                    }
                } else {
                    stockStatus = 'Unavailable';
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

        // Hardcoded for now, can be dynamic
        const shippingFee = 0;
        const tax = 0;
        const total = subtotal + shippingFee + tax;

        res.render('user/checkout', {
            pageTitle: 'Checkout',
            cartItems,
            subtotal,
            originalTotal,
            totalDiscount,
            shippingFee,
            tax,
            total,
            addresses,
            user: req.user,
            hasUnavailable
        });

    } catch (error) {
        console.error('Checkout Page Error:', error);
        res.redirect('/cart');
    }
};

const placeOrder = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'Please login' });
        }

        const userId = req.session.userId;
        const { addressId, paymentMethod } = req.body;

        if (!addressId) {
            return res.status(400).json({ success: false, message: 'Please select a shipping address' });
        }

        // Fetch Cart
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Fetch Address
        const address = await Address.findById(addressId);
        if (!address) {
            return res.status(400).json({ success: false, message: 'Invalid address' });
        }

        // Final Stock Validation & Order Items Construction
        let orderItems = [];
        let subtotal = 0;

        for (const item of cart.items) {
            // Check if product reference exists
            if (!item.productId) {
                return res.status(400).json({ success: false, message: `Cart contains invalid product.` });
            }

            const product = await Product.findById(item.productId._id); // Re-fetch to be safe

            if (!product || product.isDeleted || product.isBlocked) {
                return res.status(400).json({ success: false, message: `Product ${item.productName} is unavailable` });
            }

            const variant = product.variants.find(v => v.color === item.variantId);
            if (!variant || variant.isBlocked) {
                console.log(`Variant not found or blocked: ${item.variantId} in product ${product._id}`);
                return res.status(400).json({ success: false, message: `Variant unavailable for ${item.productName}` });
            }

            const sizeObj = variant.sizes.find(s => s.size == item.size);
            if (!sizeObj || sizeObj.status === 'Inactive' || sizeObj.quantity < item.quantity) {
                console.log(`Insufficient stock or inactive: Size ${item.size}, Req: ${item.quantity}, Avail: ${sizeObj ? sizeObj.quantity : 'None'}`);
                return res.status(400).json({ success: false, message: `Insufficient stock or unavailable for ${item.productName} (${item.size})` });
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
                image: item.image
            });
        }

        // Calculate Finals
        const shippingFee = 0;
        const tax = 0;
        const totalAmount = subtotal + shippingFee + tax;

        // Create Order
        const newOrder = new Order({
            userId,
            items: orderItems,
            totalAmount,
            shippingAddress: {
                full_name: req.user ? req.user.full_name : (req.session.user ? req.session.user.name : 'User'),
                phone_number: address.phone_number,
                full_address: address.full_address,
                city: address.city,
                state: address.state,
                country: address.country,
                zip_code: address.zip_code
            },
            paymentMethod: 'COD', // Force COD per requirement
            paymentStatus: 'Pending',
            orderStatus: 'Ordered',
            shippingFee,
            tax
        });

        await newOrder.save();

        // Clear Cart
        cart.items = [];
        await cart.save();

        res.json({ success: true, orderId: newOrder._id });

    } catch (error) {
        console.error('Place Order Error:', error);
        res.status(500).json({ success: false, message: 'Failed to place order' });
    }
};

const getOrderSuccess = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId);

        if (!order) return res.redirect('/');

        res.render('user/order-success', {
            pageTitle: 'Order Confirmed',
            order,
            user: req.session.user
        });
    } catch (error) {
        console.error('Order Success Error:', error);
        res.redirect('/');
    }
};

// Add Address Inline (if needed, or reuse profile route)
const addAddress = async (req, res) => {
    try {
        const { full_address, city, state, country, zip_code, phone_number } = req.body;
        const userId = req.session.userId;

        const newAddress = new Address({
            user_id: userId,
            full_address,
            city,
            state,
            country,
            zip_code,
            phone_number
        });

        await newAddress.save();
        res.json({ success: true, message: 'Address added', address: newAddress });

    } catch (error) {
        console.error('Add Address Error:', error);
        res.status(500).json({ success: false, message: 'Failed to add address' });
    }
};

module.exports = {
    getCheckout,
    placeOrder,
    getOrderSuccess,
    addAddress
};
