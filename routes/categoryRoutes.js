const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/categoryController");
const adminAuth = require("../middlewares/adminAuth"); // Assuming this exists based on previous context

// List
router.get("/admin/categories", adminAuth, categoryController.getCategories);

// Add
router.get("/admin/categories/add", adminAuth, categoryController.getAddCategory);
router.post("/admin/categories/add", adminAuth, categoryController.postAddCategory);

// Edit
router.get("/admin/categories/edit/:id", adminAuth, categoryController.getEditCategory);
router.post("/admin/categories/edit/:id", adminAuth, categoryController.postEditCategory);

// Delete (Soft)
router.post("/admin/categories/delete/:id", adminAuth, categoryController.deleteCategory);

// Toggle Block
router.post("/admin/categories/toggle-block/:id", adminAuth, categoryController.toggleBlockCategory);

module.exports = router;
