const express = require("express");
const router = express.Router();
const adminOrderController = require("../controllers/adminOrderController");
const adminAuth = require("../middlewares/adminAuth"); // Ensure admin access

// List Orders
router.get("/admin/orders", adminAuth, adminOrderController.getOrders);

// Order Details
router.get("/admin/orders/:id", adminAuth, adminOrderController.getOrderDetails);

// Update Status (AJAX or Form)
router.post("/admin/orders/update-status/:id", adminAuth, adminOrderController.updateOrderStatus);

// Approve Return
router.post("/admin/orders/return-approve/:orderId/:itemId", adminAuth, adminOrderController.approveReturnItem);

// Reject Return
router.post("/admin/orders/return-reject/:orderId/:itemId", adminAuth, adminOrderController.rejectReturnItem);

module.exports = router;
