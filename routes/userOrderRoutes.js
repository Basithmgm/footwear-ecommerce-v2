const express = require('express');
const router = express.Router();
const userOrderController = require('../controllers/userOrderController');
const auth = require('../middlewares/authMiddleware');

// Protect all routes with auth middleware
router.use(auth);

// List Orders
router.get('/orders', userOrderController.getMyOrders);

// Order Details
router.get('/orders/:id', userOrderController.getOrderDetails);

// Cancel Order
router.post('/orders/cancel/:id', userOrderController.cancelOrder);

// Return Order
router.post('/orders/return/:id', userOrderController.returnOrder);

// Download Invoice
router.get('/orders/invoice/:id', userOrderController.downloadInvoice);

module.exports = router;
