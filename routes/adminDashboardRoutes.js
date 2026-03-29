const express = require("express");
const router = express.Router();
const adminDashboardController = require("../controllers/adminDashboardController");
const adminAuth = require("../middlewares/adminAuth");
const noCache = require("../middlewares/noCache");

// GET /admin/dashboard
router.get("/admin/dashboard", adminAuth, noCache, adminDashboardController.getDashboard);

// GET /admin/api/dashboard-stats
router.get("/admin/api/dashboard-stats", adminAuth, adminDashboardController.getDashboardData);

module.exports = router;
