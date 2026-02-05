const Product = require("../models/Product");
const Category = require("../models/Category");
const getProductList = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const products = await Product.find({ isDeleted: false })
            .populate({
                path: 'category',
                populate: { path: 'parentCategory' }
            })
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
    console.log("DEBUG CONTROLLER: postAddProduct started");
    console.log("DEBUG: Keys in body:", Object.keys(req.body));

    // TEMPORARY DEBUG: Early return REMOVED
    // try/catch block proceeds below

    try {
        const { brand, model, description, category, status, isFeatured, variants } = req.body;
        console.log("DEBUG: Body parsed. Brand:", brand);
        console.log("DEBUG: Variants raw type:", typeof variants);
        if (variants) console.log("DEBUG: Variants raw length:", variants.length);

        let parsedVariants = [];
        try {
            if (!variants) throw new Error("Variants data is missing from request body.");
            parsedVariants = JSON.parse(variants);
            console.log(`DEBUG: Variants parsed. Count: ${parsedVariants.length}`);
        } catch (e) {
            console.error("Error parsing variants JSON:", e);
            throw new Error("Invalid variants data: " + e.message);
        }

        const files = req.files || [];
        console.log(`DEBUG: Files received. Count: ${files.length}`);

        // Process Variants and Map Files
        const finalVariants = parsedVariants.map((variant, index) => {
            // Find Color Image (Expect 1)
            const colorImgFile = files.find(f => f.fieldname === `variantColorImage_${index}`);
            const colorImagePath = colorImgFile ? colorImgFile.path : null;

            // Find Gallery Images (Expect Multiple)
            const galleryFiles = files.filter(f => f.fieldname === `variantGalleryImages_${index}`);
            const galleryPaths = galleryFiles.map(f => f.path);

            if (!colorImagePath) {
                console.warn(`DEBUG: No color image for variant ${index}`);
            }

            return {
                color: variant.color,
                colorImage: colorImagePath,
                variantImages: galleryPaths,
                sizes: variant.sizes.map(s => ({
                    size: Number(s.size),
                    quantity: Number(s.quantity),
                    sku: s.sku,
                    regularPrice: Number(s.regularPrice),
                    salePrice: Number(s.salePrice)
                }))
            };
        });

        console.log("DEBUG: Variants processed. Validating...");

        // Backend Validation for strict rules
        for (const v of finalVariants) {
            if (!v.colorImage) throw new Error(`Color image missing for ${v.color}`);
            if (v.variantImages.length < 3) throw new Error(`At least 3 gallery images required for ${v.color}`);
        }

        console.log("DEBUG: Validation passed. Calculating aggregates...");

        // Calculate Aggregates
        const totalStock = finalVariants.reduce((acc, v) => {
            return acc + v.sizes.reduce((sum, s) => sum + s.quantity, 0);
        }, 0);

        // Find Min Prices for Sorting/Display
        let minRegPrice = Infinity;
        let minSalePrice = Infinity;

        finalVariants.forEach(v => {
            v.sizes.forEach(s => {
                if (s.regularPrice < minRegPrice) minRegPrice = s.regularPrice;
                if (s.salePrice < minSalePrice) minSalePrice = s.salePrice;
            });
        });

        if (minRegPrice === Infinity) minRegPrice = 0;
        if (minSalePrice === Infinity) minSalePrice = 0;

        console.log("DEBUG: Creating Product instance...");

        const newProduct = new Product({
            brand,
            model,
            productName: `${brand} ${model}`,
            description,
            category,
            regularPrice: minRegPrice,
            salePrice: minSalePrice,
            totalStock,
            variants: finalVariants,
            status,
            isFeatured: isFeatured === 'on'
        });

        console.log("DEBUG: Saving Product to DB...");
        try {
            await newProduct.save();
            console.log("DEBUG: Product saved successfully!");
        } catch (saveError) {
            console.error("DEBUG: Save failed!");
            // Log only the message to avoid potential circular JSON issues with full error objects
            console.error("DEBUG: Save error message:", saveError.message);
            if (saveError.errors) {
                const errors = Object.keys(saveError.errors).map(key => saveError.errors[key].message);
                console.error("DEBUG: Validation errors:", errors);
            }
            throw saveError; // Re-throw to be caught by outer catch
        }

        req.session.successMessage = "Product added successfully!";
        // res.redirect("/admin/products"); <- Old way
        // Return JSON to notify client of success
        console.log("DEBUG: Sending JSON success response.");
        return res.status(200).json({ success: true, redirectUrl: "/admin/products" });

    } catch (error) {
        console.error("DEBUG: Error in catch block:", error);
        console.error("Error adding product:", error);
        const categories = await Category.find({ isDeleted: false }).populate('parentCategory').sort({ name: 1 }).lean();
        res.render("admin/product/add", {
            categories: categories,
            error: error.message || "Error adding product.",
            oldInput: req.body
        });
        console.log("DEBUG: Error page rendered.");
    }
};

const getEditProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        if (!product) {
            return res.redirect('/admin/products');
        }
        const categories = await Category.find({ isDeleted: false }).sort({ name: 1 }).lean();

        const error = req.session.error;
        req.session.error = null;

        res.render('admin/product/edit', {
            product,
            categories,
            error: error
        });
    } catch (error) {
        console.error("Error getting edit product:", error);
        res.redirect('/admin/products');
    }
};

const postEditProduct = async (req, res) => {
    try {
        console.log("DEBUG: postEditProduct hit. Body keys:", Object.keys(req.body));
        const productId = req.params.id;
        const { brand, model, description, category, status, isFeatured, variants } = req.body;

        let parsedVariants = [];
        try {
            parsedVariants = JSON.parse(variants);
        } catch (e) {
            console.error("Error parsing variants JSON:", e);
            throw new Error("Invalid variants data.");
        }

        const files = req.files || [];

        // Process Variants
        const finalVariants = parsedVariants.map((variant, index) => {
            // New Color Image (if uploaded)
            const colorImgFile = files.find(f => f.fieldname === `variantColorImage_${index}`);

            // New Gallery Images (if uploaded)
            const galleryFiles = files.filter(f => f.fieldname === `variantGalleryImages_${index}`);
            const newGalleryPaths = galleryFiles.map(f => f.path);

            // Determine final Color Image
            // If new file, use it. Else use existing (passed in metadata).
            let finalColorImage = variant.colorImage; // from metadata
            if (colorImgFile) {
                finalColorImage = colorImgFile.path;
            }

            // Determine final Gallery Images
            // Merge existing (from metadata) + new uploads
            // Note: Frontend sends `existingGallery` array in metadata
            const existingGallery = variant.existingGallery || [];
            const finalGallery = [...existingGallery, ...newGalleryPaths];

            // Determine isBlocked from metadata (default false)
            const isVariantBlocked = variant.isBlocked === true;

            return {
                color: variant.color,
                colorImage: finalColorImage,
                variantImages: finalGallery,
                sizes: variant.sizes.map(s => ({
                    size: Number(s.size),
                    quantity: Number(s.quantity),
                    sku: s.sku,
                    regularPrice: Number(s.regularPrice),
                    salePrice: Number(s.salePrice),
                    // If variant is blocked, block all sizes. Otherwise respect existing size block if we were granular (but here we just block all)
                    isBlocked: isVariantBlocked,
                    status: isVariantBlocked ? 'Inactive' : (s.status === 'Inactive' ? 'Active' : s.status || 'Active')
                }))
            };
        });

        // Validation
        for (const v of finalVariants) {
            if (!v.colorImage) throw new Error(`Color image missing for ${v.color}`);
            if (v.variantImages.length < 3) throw new Error(`At least 3 gallery images required for ${v.color}`);
        }

        // Calculate Aggregates
        const totalStock = finalVariants.reduce((acc, v) => {
            return acc + v.sizes.reduce((sum, s) => sum + s.quantity, 0);
        }, 0);

        // Min Prices
        let minRegPrice = Infinity;
        let minSalePrice = Infinity;

        finalVariants.forEach(v => {
            v.sizes.forEach(s => {
                if (s.regularPrice < minRegPrice) minRegPrice = s.regularPrice;
                if (s.salePrice < minSalePrice) minSalePrice = s.salePrice;
            });
        });

        if (minRegPrice === Infinity) minRegPrice = 0;
        if (minSalePrice === Infinity) minSalePrice = 0;

        await Product.findByIdAndUpdate(productId, {
            brand,
            model,
            productName: `${brand} ${model}`, // Regenerate name
            description,
            category,
            regularPrice: minRegPrice,
            salePrice: minSalePrice,
            totalStock,
            variants: finalVariants,
            status,
            isFeatured: isFeatured === 'on'
        });

        req.session.successMessage = "Product updated successfully!";
        res.redirect('/admin/products');

    } catch (error) {
        console.error("Error updating product:", error);
        req.session.error = error.message;
        res.redirect(`/admin/products/edit/${req.params.id}`);
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
        if (!product) return res.redirect('/admin/products');

        // Toggle Product Block
        product.isBlocked = !product.isBlocked;

        // Update Product Status based on Blocked state
        // User requested: Blocked -> Unavailable, Unblocked -> Available
        product.status = product.isBlocked ? 'Unavailable' : 'Available';

        // Cascade Block/Unblock to all Variants and Sizes
        if (product.variants && product.variants.length > 0) {
            product.variants.forEach(variant => {
                if (variant.sizes && variant.sizes.length > 0) {
                    variant.sizes.forEach(size => {
                        size.isBlocked = product.isBlocked;
                        // Variant sizes use Active/Inactive in schema
                        size.status = product.isBlocked ? 'Inactive' : 'Active';
                    });
                }
            });
            product.markModified('variants');
        }

        await product.save();
        req.session.successMessage = `Product has been ${product.isBlocked ? 'blocked' : 'unblocked'} and status updated to ${product.status}.`;
        res.redirect('/admin/products');
    } catch (error) {
        console.error("Error toggling block:", error);
        req.session.errorMessage = "Error updating product status.";
        res.redirect('/admin/products');
    }
};

const getProductVariants = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.redirect('/admin/products');

        res.render('admin/product/variants', {
            product,
            success: req.session.successMessage,
            error: req.session.errorMessage
        });
        req.session.successMessage = null;
        req.session.errorMessage = null;
    } catch (error) {
        console.error("Error fetching variants:", error);
        res.redirect('/admin/products');
    }
};

const toggleVariantBlock = async (req, res) => {
    try {
        const { productId, variantId, sizeId } = req.params;
        const product = await Product.findById(productId);

        if (!product) return res.redirect('/admin/products');

        const variant = product.variants.id(variantId);
        if (variant) {
            const size = variant.sizes.id(sizeId);
            if (size) {
                size.isBlocked = !size.isBlocked;
                size.status = size.isBlocked ? 'Inactive' : 'Active';
                size.updatedAt = Date.now();
                await product.save();
                req.session.successMessage = `Variant size ${size.isBlocked ? 'blocked' : 'unblocked'} successfully.`;
            }
        }
        res.redirect(`/admin/products/variants/${productId}`);
    } catch (error) {
        console.error("Error toggling variant block:", error);
        req.session.errorMessage = "Error updating variant status.";
        res.redirect(`/admin/products/variants/${req.params.productId}`);
    }
};

const deleteVariantSize = async (req, res) => {
    try {
        const { productId, variantId, sizeId } = req.params;
        const product = await Product.findById(productId);

        if (!product) return res.redirect('/admin/products');

        const variant = product.variants.id(variantId);
        if (variant) {
            variant.sizes.pull({ _id: sizeId });
            // If no sizes left, should we delete the variant? Maybe keep for now.
            // But let's recalculate totals potentially.
            await product.save();
            req.session.successMessage = "Variant size deleted successfully.";
        }
        res.redirect(`/admin/products/variants/${productId}`);
    } catch (error) {
        console.error("Error deleting variant size:", error);
        req.session.errorMessage = "Error deleting variant.";
        res.redirect(`/admin/products/variants/${req.params.productId}`);
    }
};

const editVariantSize = async (req, res) => {
    try {
        const { productId, variantId, sizeId } = req.params;
        const { quantity, regularPrice, salePrice } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            req.session.errorMessage = "Product not found.";
            return res.redirect('/admin/products');
        }

        const variant = product.variants.id(variantId);
        if (!variant) {
            req.session.errorMessage = "Variant not found.";
            return res.redirect(`/admin/products/variants/${productId}`);
        }

        const size = variant.sizes.id(sizeId);
        if (!size) {
            req.session.errorMessage = "Size not found.";
            return res.redirect(`/admin/products/variants/${productId}`);
        }

        // Update fields
        size.quantity = Number(quantity);
        size.regularPrice = Number(regularPrice);
        size.salePrice = Number(salePrice);
        size.updatedAt = Date.now();

        // Recalculate Product Globals (Stock & Min Prices)
        let totalStock = 0;
        let minReg = Infinity;
        let minSale = Infinity;

        product.variants.forEach(v => {
            v.sizes.forEach(s => {
                totalStock += s.quantity;
                if (s.regularPrice < minReg) minReg = s.regularPrice;
                if (s.salePrice < minSale) minSale = s.salePrice;
            });
        });

        product.totalStock = totalStock;
        product.regularPrice = minReg === Infinity ? 0 : minReg;
        product.salePrice = minSale === Infinity ? 0 : minSale;

        await product.save();
        req.session.successMessage = "Variant size updated successfully.";
        res.redirect(`/admin/products/variants/${productId}`);

    } catch (error) {
        console.error("Error editing variant size:", error);
        req.session.errorMessage = "Error updating variant size.";
        res.redirect(`/admin/products/variants/${req.params.productId}`);
    }
};

module.exports = {
    getProductList,
    getAddProduct,
    postAddProduct,
    getEditProduct,
    postEditProduct,
    softDeleteProduct,
    toggleBlockProduct,
    getProductVariants,
    toggleVariantBlock,
    deleteVariantSize,
    editVariantSize
};
