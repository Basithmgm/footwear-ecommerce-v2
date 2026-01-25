const Product = require("../models/Product");
const Category = require("../models/Category");
const getProductList = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const products = await Product.find({ isDeleted: false })
            .populate("category")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments({ isDeleted: false });
        const totalPages = Math.ceil(totalProducts / limit);

        res.render("admin/product/list", {
            products,
            currentPage: page,
            totalPages,
            totalProducts,
            success: req.session.successMessage,
            error: req.session.errorMessage
        });
        req.session.successMessage = null;
        req.session.errorMessage = null;
    } catch (error) {
        console.error("Error fetching product list:", error);
        res.status(500).send("Internal Server Error");
    }
};

const getAddProduct = async (req, res) => {
    try {
        const categories = await Category.find({ isDeleted: false }).populate('parentCategory').sort({ name: 1 });
        res.render("admin/product/add", {
            categories: categories,
            error: null,
            oldInput: {}
        });
    } catch (error) {
        console.error("Error rendering add product:", error);
        res.redirect("/admin/products");
    }
};

const postAddProduct = async (req, res) => {
    try {
        const { productName, description, category, regularPrice, salePrice, status, isFeatured, variants } = req.body;

        // 'variants' in req.body might be a JSON string if sent as formData, or object structure.
        // Assuming standard form submission where variants[0][color] maps to body.
        // However, with file uploads (multipart), complex nesting can be tricky.
        // A common strategy is to send 'variants' as a JSON string field to parse.
        // OR map manually from flat fields. 
        // Let's assume the user's frontend sends a 'variants' stringified JSON for data 
        // and files are sent with fieldnames like 'variant-images-0', 'variant-images-1' etc.

        // For this Implementation, we will assume:
        // 1. req.body.variants is a JSON string containing the structure (colors, sizes).
        // 2. req.files is an array of files.
        //    We need to map files to variants. This usually requires a structured naming convention.
        //    Let's assume the JSON 'variants' array has a temporary 'tempId' or index that matches the file fieldname.

        // NOTE: Without seeing the Frontend, this is a BEST GUESS implementation.
        // We will try to parse 'variants' if it's a string.

        let parsedVariants = [];
        if (typeof variants === 'string') {
            parsedVariants = JSON.parse(variants);
        } else if (Array.isArray(variants)) {
            parsedVariants = variants;
        }

        // Handle Images
        // Assumption: req.files is array. We need to know which image belongs to which variant.
        // If using Multer with fieldname 'variantImages', it's hard to separate.
        // Ideally, frontend sends fieldname 'variantImages_0', 'variantImages_1'.
        // Let's iterate parsedVariants and look for matching files in req.files if possible,
        // OR assume the variants object already contains the logical mapping and we just process files.

        // SIMPLIFIED APPROACH for MVP:
        // We expect req.files to organized or mapped. 
        // Let's assume 'parsedVariants' comes with empty 'variantImages' arrays, 
        // and we verify that we recieved files.
        // Actually, let's look at req.files. If it's a flat list, we can't easily guess.

        // Let's write abstract logic that can be easily adapted:
        // "Files are processed and paths added to the corresponding variant object"

        const files = req.files; // Array of files

        // Process variants to add their specific images
        const finalVariants = parsedVariants.map((variant, index) => {
            // Retrieve files for this specific variant index
            // Front-end should send files with fieldname `variantImages[${index}]`
            // Multer would put them in req.files if configured as any(), or specific fields.
            // If using req.files (array), we need to filter.

            const variantFiles = files.filter(f => f.fieldname === `variantImages[${index}]` || f.fieldname === `variantImages_${index}`);
            const imagePaths = variantFiles.map(f => f.path);

            return {
                ...variant,
                variantImages: imagePaths,
                // Ensure quantities are numbers
                sizes: variant.sizes.map(s => ({ size: s.size, quantity: Number(s.quantity) }))
            };
        });

        // Validate Validation: Min 3 images per variant
        for (const v of finalVariants) {
            if (v.variantImages.length < 3) {
                throw new Error(`Color ${v.color} must have at least 3 images.`);
            }
        }

        // Calculate Total Stock
        const totalStock = finalVariants.reduce((acc, curr) => {
            return acc + curr.sizes.reduce((sAcc, s) => sAcc + s.quantity, 0);
        }, 0);

        const newProduct = new Product({
            productName,
            description,
            category,
            regularPrice,
            salePrice,
            totalStock, // Calculated
            variants: finalVariants,
            status,
            isFeatured: req.body.isFeatured === 'on'
        });

        await newProduct.save();
        req.session.successMessage = "Product added successfully!";
        res.redirect("/admin/products");

    } catch (error) {
        console.error("Error adding product:", error);
        const categories = await Category.find({ isDeleted: false }).populate('parentCategory').sort({ name: 1 }).lean();
        res.render("admin/product/add", {
            categories: categories,
            error: error.message || "Error adding product. Please try again.",
            oldInput: req.body // Note: Nesting structure might break simple re-population
        });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        if (!product) {
            return res.redirect('/admin/products');
        }
        const categories = await Category.find({ isDeleted: false }).sort({ name: 1 }).lean();
        res.render('admin/product/edit', {
            product,
            categories,
            error: null
        });
    } catch (error) {
        console.error("Error getting edit product:", error);
        res.redirect('/admin/products');
    }
};

const postEditProduct = async (req, res) => {
    try {
        const { productName, description, category, regularPrice, salePrice, stock, status, existingImages, isFeatured } = req.body;
        const files = req.files;
        const productId = req.params.id;

        // existingImages might be a string (if 1) or array (if > 1) or undefined (if 0)
        let currentImages = [];
        if (existingImages) {
            currentImages = Array.isArray(existingImages) ? existingImages : [existingImages];
        }

        // New images
        let newImages = [];
        if (files && files.length > 0) {
            newImages = files.map(file => file.path);
        }

        const finalImages = [...currentImages, ...newImages];

        if (finalImages.length < 3) {
            const product = await Product.findById(productId);
            const categories = await Category.find({ isDeleted: false }).sort({ name: 1 }).lean();
            return res.render('admin/product/edit', {
                product: { ...product.toObject(), ...req.body, productImages: finalImages }, // preserve sort of inputs
                categories,
                error: "Product must have at least 3 images."
            });
        }

        await Product.findByIdAndUpdate(productId, {
            productName,
            description,
            category,
            regularPrice,
            salePrice,
            stock,
            status,
            status,
            productImages: finalImages,
            isFeatured: req.body.isFeatured === 'on'
        });

        req.session.successMessage = "Product updated successfully!";
        res.redirect('/admin/products');

    } catch (error) {
        console.error("Error updating product:", error);
        res.redirect('/admin/products');
    }
};

const softDeleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.params.id, { isDeleted: true });
        req.session.successMessage = "Product deleted successfully.";
        res.redirect('/admin/products');
    } catch (error) {
        console.error("Error deleting product:", error);
        res.redirect('/admin/products');
    }
};

// Implement Block/Unblock toggle if needed
const toggleBlockProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        product.isBlocked = !product.isBlocked;
        await product.save();
        req.session.successMessage = `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully.`;
        res.redirect('/admin/products');
    } catch (error) {
        console.error("Error toggling block:", error);
        res.redirect('/admin/products');
    }
};

module.exports = {
    getProductList,
    getAddProduct,
    postAddProduct,
    getEditProduct,
    postEditProduct,
    softDeleteProduct,
    toggleBlockProduct
};
