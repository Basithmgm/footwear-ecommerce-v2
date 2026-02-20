const Order = require('../models/Order');
const Product = require('../models/Product');

// List Orders with Pagination, Search, and Filter
exports.getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const search = req.query.search || "";
        const statusFilter = req.query.status || "";

        const query = {};

        if (statusFilter) {
            query.orderStatus = statusFilter;
        }

        if (search) {
            // Search by Order ID or Customer Name (in shippingAddress)
            // Note: Searching by ObjectId requires exact match, so checking if search is valid ObjectId
            const isObjectId = search.match(/^[0-9a-fA-F]{24}$/);

            if (isObjectId) {
                query._id = search;
            } else {
                query['shippingAddress.full_name'] = { $regex: search, $options: 'i' };
            }
        }

        const totalOrders = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .sort({ orderedDate: -1 }) // Descending order
            .skip((page - 1) * limit)
            .limit(limit);

        const totalPages = Math.ceil(totalOrders / limit);

        res.render('admin/orders/list', {
            pageTitle: 'Order Management',
            orders,
            currentPage: page,
            totalPages,
            search,
            statusFilter,
            path: '/admin/orders'
        });
    } catch (err) {
        console.error("Get Orders Error:", err);
        res.status(500).send("Server Error");
    }
};

// Get Order Details
exports.getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId).populate('items.productId');

        if (!order) {
            return res.redirect('/admin/orders');
        }

        res.render('admin/orders/detail', {
            pageTitle: 'Order Details',
            order,
            path: '/admin/orders'
        });
    } catch (err) {
        console.error("Get Order Details Error:", err);
        res.redirect('/admin/orders');
    }
};

// Update Order Status
exports.updateOrderStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        const oldStatus = order.orderStatus;

        // Allowed transitions check can be added here if needed

        // Stock Restoration Logic
        // If status changes to Cancelled or Returned, restore stock
        if ((status === 'Cancelled' || status === 'Returned') && (oldStatus !== 'Cancelled' && oldStatus !== 'Returned')) {
            for (const item of order.items) {
                const product = await Product.findById(item.productId);
                if (product) {
                    const variant = product.variants.find(v => v.color === item.variantId);
                    if (variant) {
                        const sizeObj = variant.sizes.find(s => s.size == item.size); // item.size is Number or String? Model says String.
                        if (sizeObj) {
                            sizeObj.quantity += item.quantity;
                        }
                    }
                    await product.save();
                }
            }
        }

        // If we strictly follow the requirement "Inventory/Stock management", we might also want to handle
        // the reverse case (Cancelled -> Pending), but that's rare and dangerous. 
        // For now, only restoration is critical.

        order.orderStatus = status;

        if (status === 'Delivered') {
            order.deliveryDate = Date.now();
            order.paymentStatus = 'Completed'; // Assuming COD implies completed on delivery
        } else if (status === 'Cancelled') {
            // If payment was already made (e.g. Online), logic for refund would go here
            // For COD, just mark as Cancelled.
        }

        await order.save();

        res.json({ success: true, message: "Order status updated successfully" });

    } catch (err) {
        console.error("Update Order Status Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};
