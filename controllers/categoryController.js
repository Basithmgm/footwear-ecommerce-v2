const Category = require('../models/Category');

// GET: List all categories (Admin)
// GET: List all categories (Admin)
exports.getCategories = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 2;
        const skip = (page - 1) * limit;

        // Count Total Main Categories (Level 0)
        const totalMainCategories = await Category.countDocuments({ isDeleted: false, level: 0 });
        const totalPages = Math.ceil(totalMainCategories / limit);

        // Fetch Paginated Main Categories
        // Note: Standard sort here (Kids, Men, Unisex, Women). 
        // If specific order (Men, Women, Kids...) is strictly required with pagination, 
        // we'd need aggregation with $addFields custom sort weight. 
        // For now, simple alphabetical sort on gender is efficient.
        const mainCats = await Category.find({ isDeleted: false, level: 0 })
            .sort({ gender: 1, name: 1 }) // Sorted by Gender then Name
            .skip(skip)
            .limit(limit);

        // Fetch all descendants for these Main Categories
        // 1. Get IDs of fetched main categories
        const mainIds = mainCats.map(c => c._id);

        // 2. Fetch Level 1 (Sub) categories whose parent is in mainIds
        const subCats = await Category.find({ isDeleted: false, level: 1, parentCategory: { $in: mainIds } })
            .populate('parentCategory');
        const subIds = subCats.map(c => c._id);

        // 3. Fetch Level 2 (Child) categories whose parent is in subIds
        const childCats = await Category.find({ isDeleted: false, level: 2, parentCategory: { $in: subIds } })
            .populate('parentCategory');

        // Combine all fetched categories
        const allFetched = [...mainCats, ...subCats, ...childCats];

        // Grouping & Tree Construction Logic (similar to before, but limited to fetched set)
        // We can just iterate mainCats (which are already sorted within the page)
        // and append their children.

        const flattenedList = [];

        // Helper to find children within fetched set
        const getChildren = (parentId) => {
            return allFetched.filter(c =>
                c.parentCategory &&
                (c.parentCategory._id ? c.parentCategory._id.toString() : c.parentCategory.toString()) === parentId.toString()
            ).sort((a, b) => a.name.localeCompare(b.name));
        };

        mainCats.forEach(main => {
            flattenedList.push(main); // Level 0

            const subs = getChildren(main._id); // Level 1
            subs.forEach(sub => {
                flattenedList.push(sub);

                const children = getChildren(sub._id); // Level 2
                children.forEach(child => {
                    flattenedList.push(child);
                });
            });
        });

        res.render('admin/category/list', {
            path: '/admin/categories',
            categories: flattenedList,
            currentPage: page,
            totalPages: totalPages,
            error: req.query.error,
            success: req.session.successMessage
        });
        req.session.successMessage = null;
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=Server Error');
    }
};

// GET: Add Category Form
exports.getAddCategory = async (req, res) => {
    try {
        const { parent_id, page } = req.query;
        let lockedParent = null;

        if (parent_id) {
            lockedParent = await Category.findById(parent_id);
        }

        // Fetch potential parents (Level 0 and 1 only, as we assume max depth 2 for now)
        const parentCategories = await Category.find({
            isDeleted: false,
            level: { $lt: 2 }
        }).sort({ gender: 1, level: 1, name: 1 });

        res.render('admin/category/add', {
            path: '/admin/categories',
            parentCategories,
            lockedParent, // Pass the locked parent if it exists
            error: null,
            oldInput: {},
            returnPage: page || 1
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/categories?error=Server Error');
    }
};

// POST: Add Category
exports.postAddCategory = async (req, res) => {
    try {
        const { name, gender, parentCategory, description, returnPage } = req.body;

        // Basic Validation
        if (!name || !gender) {
            throw new Error("Name and Gender are required.");
        }

        let level = 0;
        let finalParent = null;

        if (parentCategory) {
            const parent = await Category.findById(parentCategory);
            if (!parent) throw new Error("Invalid Parent Category");

            finalParent = parent._id;
            level = parent.level + 1;

            // Validate Logic: Child must match Parent's Gender? 
            // Optional: Enforce strict gender inheritance or allow User to choose.
            // For now, let's assume if parent is chosen, gender MUST match parent's gender implicitly,
            // OR we rely on the form to send the correct gender.
            // Let's enforce: If parent exists, Gender = Parent's Gender.
            if (gender !== parent.gender) {
                // Alternatively, throw error. Or just override.
                // Let's throw error for consistency.
                throw new Error(`Child category gender (${gender}) must match parent's gender (${parent.gender})`);
            }
        }

        // Escape regex function
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // Case-Insensitive Duplication Check
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
            gender: gender,
            parentCategory: finalParent
        });

        if (existingCategory) {
            throw new Error(`A category with this name (${name}) already exists in this group.`);
        }

        await Category.create({
            name,
            gender,
            parentCategory: finalParent,
            level,
            description
        });

        req.session.successMessage = "Category added successfully";
        res.redirect(`/admin/categories?page=${returnPage || 1}`);

    } catch (err) {
        // Handle Duplicate Key Error (Fallback)
        if (err.code === 11000) {
            err.message = "A category with this name already exists in this group.";
        }

        // Re-construct context for re-render
        const parentCategories = await Category.find({ isDeleted: false, level: { $lt: 2 } });
        let lockedParent = null;
        if (req.body.parentCategory) {
            try {
                lockedParent = await Category.findById(req.body.parentCategory);
            } catch (e) { /* ignore */ }
        }

        res.render('admin/category/add', {
            path: '/admin/categories',
            parentCategories,
            lockedParent, // Pass it back so view knows we are in subcat mode
            error: err.message,
            oldInput: req.body,
            returnPage: req.body.returnPage || 1
        });
    }
};

// GET: Edit Category Form
exports.getEditCategory = async (req, res) => {
    try {
        const { page } = req.query;
        const category = await Category.findById(req.params.id);
        if (!category) return res.redirect('/admin/categories?error=Category not found');

        // Prevent self-parenting and circular dependency (simple check: don't show self or children as options)
        // For simplicity, just show all eligible parents.
        const parentCategories = await Category.find({
            isDeleted: false,
            level: { $lt: 2 },
            _id: { $ne: category._id }
        });

        res.render('admin/category/edit', {
            path: '/admin/categories',
            category,
            parentCategories,
            error: null,
            redirectPage: page || 1
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/categories?error=Server Error');
    }
};

// POST: Edit Category
exports.postEditCategory = async (req, res) => {
    try {
        const { name, gender, parentCategory, description, isBlocked, redirectPage } = req.body;
        const category = await Category.findById(req.params.id);
        if (!category) throw new Error("Category not found");

        // Logic for changing parent is complex (updating levels of children).
        // For this MVP refactor, assume level/parent changes are allowed but handle carefully.
        // If Parent Changed:


        // Parent Category is locked in UI (disabled), so req.body.parentCategory will be missing.
        // We must RETAIN the existing parent and level.
        const currentParent = category.parentCategory;
        const currentLevel = category.level;

        // If for some reason the user hacked it and sent a new parent, we ignore it or validate it.
        // Let's stick to the requirement: "lock parent category". So we ignore inputs.
        const newParent = currentParent;
        const newLevel = currentLevel;

        // Escape regex function
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Case-Insensitive Duplication Check (excluding current category)
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
            gender: gender,
            parentCategory: newParent,
            _id: { $ne: req.params.id }
        });

        if (existingCategory) {
            throw new Error(`A category with this name (${name}) already exists in this group.`);
        }

        category.name = name;
        category.gender = gender;
        // Parent and Level remain unchanged
        category.description = description;
        // Block status is handled separately in management page, but if field exists update it (backward compatibility)
        if (typeof isBlocked !== 'undefined') {
            category.isBlocked = isBlocked === 'on';
        }

        await category.save();

        // TODO: If this category had children, their levels might need updating if we moved this category.
        // For strict rules, maybe disable moving a parent? 
        // Let's leave deep recursion out for now unless requested.

        req.session.successMessage = "Category updated successfully";
        res.redirect(`/admin/categories?page=${redirectPage || 1}`);
    } catch (err) {
        // Handle Duplicate Key Error
        if (err.code === 11000) {
            err.message = "A category with this name already exists in this group.";
        }

        const parentCategories = await Category.find({ isDeleted: false, level: { $lt: 2 }, _id: { $ne: req.params.id } });
        res.render('admin/category/edit', {
            path: '/admin/categories',
            category: { ...req.body, _id: req.params.id }, // Fake obj for re-render
            parentCategories,
            error: err.message,
            redirectPage: req.body.redirectPage || 1
        });
    }
};

// GET: Toggle Block (Soft Delete or Block?)
// User asked to "delete category section... and build category section".
// Usually 'Delete' implies Soft Delete.
exports.deleteCategory = async (req, res) => {
    try {
        await Category.findByIdAndUpdate(req.params.id, { isDeleted: true });
        req.session.successMessage = "Category deleted successfully";
        res.redirect('/admin/categories');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/categories?error=Delete Failed');
    }
};

// POST: Toggle Block Status
exports.toggleBlockCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.redirect('/admin/categories?error=Category not found');
        }

        category.isBlocked = !category.isBlocked;
        await category.save();

        req.session.successMessage = category.isBlocked ? "Category Blocked" : "Category Unblocked";
        res.redirect('/admin/categories');
    } catch (err) {
        console.error("Toggle Block Error:", err);
        res.redirect('/admin/categories?error=Operation Failed');
    }
};
