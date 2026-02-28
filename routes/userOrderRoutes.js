const express = require("express");
const router = express.Router();
const userOrderController = require("../controllers/userOrderController");
const auth = require("../middlewares/authMiddleware");

// Protect all routes with auth middleware
//router.use(auth);//It acts as a gatekeeper, checking if a user is logged in or authorized before allowing access to any following routes.

// List Orders
router.get("/orders", userOrderController.getMyOrders);

// Order Details
router.get("/orders/:id", userOrderController.getOrderDetails);

// Cancel Order
router.post("/orders/cancel/:id", userOrderController.cancelOrder);

// Return Order
router.post("/orders/return/:id", userOrderController.returnOrder);

// Cancel Order Item
router.post(
  "/orders/cancel-item/:orderId/:itemId",
  userOrderController.cancelOrderItem,
);

// Return Order Item
router.post(
  "/orders/return-item/:orderId/:itemId",
  userOrderController.returnOrderItem,
);

// Download Invoice
router.get("/orders/invoice/:id", userOrderController.downloadInvoice);

module.exports = router;
