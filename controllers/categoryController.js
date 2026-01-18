const Category = require('../models/Category');

// Get Categories (List with Pagination, Search, Sort)
exports.getCategories = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const search = req.query.search || "";

        const query = { isDeleted: false };

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        const categories = await Category.find(query)
            .sort({ createdAt: -1 }) // Sort descending
            .skip((page - 1) * limit)
            .limit(limit);

        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit);

        res.render('admin/category/list', {
            categories,
            currentPage: page,
            totalPages,
            search,
            totalCategories,
            path: '/admin/categories', // For sidebar active state
            success: req.query.success,
            error: req.query.error
        });
    } catch (err) {
        console.error("Get Categories Error:", err);
        res.status(500).send("Server Error");
    }
};

// Get Add Category Page
exports.getAddCategory = (req, res) => {
    res.render('admin/category/add', {
        path: '/admin/categories',
        error: null,
        oldInput: {}
    });
};

// Post Add Category
exports.postAddCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        const existing = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existing) {
            if (existing.isDeleted) {
                return res.render('admin/category/add', {
                    path: '/admin/categories',
                    error: "Category exists but is deleted. Please restore it or use a different name.", // Or handle restore logic if requested
                    oldInput: { name, description }
                });
            }
            return res.render('admin/category/add', {
                path: '/admin/categories',
                error: "Category already exists",
                oldInput: { name, description }
            });
        }

        await Category.create({ name, description });

        res.redirect('/admin/categories?success=Category added successfully');
    } catch (err) {
        console.error("Add Category Error:", err);
        res.render('admin/category/add', {
            path: '/admin/categories',
            error: "Failed to add category: " + err.message,
            oldInput: req.body
        });
    }
};

// Get Edit Category Page
exports.getEditCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category || category.isDeleted) {
            return res.redirect('/admin/categories?error=Category not found');
        }

        res.render('admin/category/edit', {
            path: '/admin/categories',
            category,
            error: null
        });
    } catch (err) {
        res.redirect('/admin/categories?error=Server Error');
    }
};

// Post Edit Category
exports.postEditCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        const category = await Category.findById(id);
        if (!category) return res.redirect('/admin/categories?error=Category not found');

        // Check name uniqueness if changed
        if (category.name.toLowerCase() !== name.toLowerCase()) {
            const existing = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
            if (existing) {
                return res.render('admin/category/edit', {
                    path: '/admin/categories',
                    category: { ...category.toObject(), name, description },
                    error: "Category name already exists"
                });
            }
        }

        category.name = name;
        category.description = description;
        await category.save();

        res.redirect('/admin/categories?success=Category updated successfully');
    } catch (err) {
        console.error("Edit Category Error:", err);
        res.redirect(`/admin/categories/edit/${req.params.id}?error=Update Failed`);
    }
};

// Soft Delete Category
exports.softDeleteCategory = async (req, res) => {
    try {
        await Category.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.redirect('/admin/categories?success=Category deleted successfully');
    } catch (err) {
        console.error("Delete Category Error:", err);
        res.redirect('/admin/categories?error=Delete Failed');
    }
};
