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
            // Search by partial Order ID (converted to string) or Customer Name
            query.$or = [
                { 'shippingAddress.full_name': { $regex: search, $options: 'i' } },
                { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: search, options: "i" } } }
            ];
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

        // Allowed transitions check
        if (oldStatus === 'Delivered') {
            return res.status(400).json({ success: false, message: "Order has already been Delivered and cannot be changed." });
        }

        // Prevent reverting from 'Out for Delivery' to 'Shipped'
        const hasOutForDeliveryItem = order.items.some(item => item.itemStatus === 'Out for Delivery');
        if ((oldStatus === 'Out for Delivery' || hasOutForDeliveryItem) && (status === 'Shipped' || status === 'Ordered')) {
            return res.status(400).json({ success: false, message: "Cannot change status back to Shipped or Ordered once a product is Out for Delivery." });
        }

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

                    // Recalculate totalStock
                    product.totalStock = product.variants.reduce((acc, v) => {
                        return acc + v.sizes.reduce((sum, s) => sum + s.quantity, 0);
                    }, 0);

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

// Approve Return Item
exports.approveReturnItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { comment } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found in order" });
        }

        if (item.itemStatus !== 'Return Requested') {
            return res.status(400).json({ success: false, message: `Item is not pending a return, current status is ${item.itemStatus}` });
        }

        // Increment Stock because it's approved
        const product = await Product.findById(item.productId);
        if (product) {
            const variant = product.variants.find(v => v.color === item.variantId);
            if (variant) {
                const sizeObj = variant.sizes.find(s => s.size == item.size);
                if (sizeObj) {
                    sizeObj.quantity += item.quantity;
                }
            }

            // Recalculate totalStock
            product.totalStock = product.variants.reduce((acc, v) => {
                return acc + v.sizes.reduce((sum, s) => sum + s.quantity, 0);
            }, 0);

            await product.save();
        }

        item.itemStatus = 'Returned';
        item.adminReturnComment = comment || 'Return Approved';

        // Update overall order status if applicable
        const allItemsReturned = order.items.every(i => i.itemStatus === 'Returned');
        if (allItemsReturned) {
            order.orderStatus = 'Returned';
        }

        await order.save();
        res.json({ success: true, message: "Return requested approved, stock restored." });

    } catch (err) {
        console.error("Approve Return Item Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Reject Return Item
exports.rejectReturnItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { comment } = req.body;

        if (!comment) {
            return res.status(400).json({ success: false, message: "A reason is required to reject a return." });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found in order" });
        }

        if (item.itemStatus !== 'Return Requested') {
            return res.status(400).json({ success: false, message: `Item is not pending a return, current status is ${item.itemStatus}` });
        }

        // Do NOT increment stock, just reject it
        item.itemStatus = 'Return Rejected';
        item.adminReturnComment = comment;

        // If overall order was 'Return Requested' but all returns are now rejected or returned, 
        // we might leave as is, or recalculate. If everything is either rejected or returned, we might just say Delivered or Returned.
        // It's safest to leave orderStatus as 'Return Requested' or whatever it was if not all are approved.

        await order.save();
        res.json({ success: true, message: "Return request rejected." });

    } catch (err) {
        console.error("Reject Return Item Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};
