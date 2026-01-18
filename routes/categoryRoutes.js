const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/categoryController");
const adminAuth = require("../middlewares/adminAuth");

// Protect all routes with adminAuth
router.get("/admin/categories", adminAuth, categoryController.getCategories);
router.get("/admin/categories/add", adminAuth, categoryController.getAddCategory);
router.post("/admin/categories/add", adminAuth, categoryController.postAddCategory);
router.get("/admin/categories/edit/:id", adminAuth, categoryController.getEditCategory);
router.post("/admin/categories/edit/:id", adminAuth, categoryController.postEditCategory);
router.post("/admin/categories/delete/:id", adminAuth, categoryController.softDeleteCategory);

module.exports = router;
