const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const adminReportController = require("../controllers/adminReportController");

router.get("/admin/sales-report", auth, adminReportController.getSalesReport);

module.exports = router;
