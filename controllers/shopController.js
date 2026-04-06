const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Offer = require("../models/Offer");
const { sendContactEmail } = require("../services/emailService");

const getShop = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const { search, sort, category, brand, minPrice, maxPrice, color, gender } =
      req.query;

    // Detect if we are on a gender-specific route or have a gender query
    const path = req.path; // e.g., '/men' or '/women'
    let genderFilter = gender || null;
    if (!genderFilter) {
      if (path === "/men") genderFilter = "Men";
      if (path === "/women") genderFilter = "Women";
      if (path === "/kids") genderFilter = "Kids";
    }

    // 1. Get Active Categories
    let activeCategoriesList = await Category.findActiveCategories();

    if (genderFilter) {
      activeCategoriesList = activeCategoriesList.filter((c) => 
        c.gender === genderFilter || c.gender === "Unisex"
      );
    }

    const activeCategoryIds = activeCategoriesList.map((c) => c._id);

    // Filter categories for the sidebar based on product presence (Strict Global Filter)
    const categoriesInUse = await Product.distinct("category", {
      category: { $in: activeCategoryIds },
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] },
    });
    
    let sidebarCategories = activeCategoriesList.filter((c) =>
      categoriesInUse.some((inUseId) => inUseId.toString() === c._id.toString()),
    );

    // Context-specific refinements
    if (genderFilter) {
      // Also hide the top-level gender entry for cleaner look if on a gender page
      sidebarCategories = sidebarCategories.filter(
        (c) => !(c.level === 0 && c.gender === genderFilter),
      );
    }

    // 2. Build matchQuery for basic filters
    let selectedCategoryName = "";
    const matchQuery = {
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] },
      category: { $in: activeCategoryIds },
    };

    if (category) {
      const activeCat = activeCategoriesList.find(c => c._id.toString() === category.toString());
      if (activeCat) {
        matchQuery.category = activeCat._id;
        selectedCategoryName = activeCat.name;
      }
    }

    // DELETED: matchQuery.gender = genderFilter; 
    // Gender restriction is already handled by activeCategoryIds filter above.


    if (brand) {
      const brandList = Array.isArray(brand) ? brand : [brand];
      matchQuery.brand = { $in: brandList };
    }

    if (color) {
      const colorList = Array.isArray(color) ? color : [color];
      matchQuery["variants.color"] = { $in: colorList.map((c) => new RegExp(c, "i")) };
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(safeSearch, "i");
      const matchedCatIds = activeCategoriesList
        .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        .map((c) => c._id);
      matchQuery.$or = [
        { productName: searchRegex },
        { description: searchRegex },
        { brand: searchRegex },
        { model: searchRegex },
        { category: { $in: matchedCatIds } },
        { "variants.color": searchRegex },
      ];
    }

    // 3. Define Offer Calculation Stages (to be shared)
    // 3. Define Offer Calculation Stages (Dynamic Lookup)
    const now = new Date();
    const offerCalculationStages = [
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "cat0",
        },
      },
      { $unwind: { path: "$cat0", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "cat0.parentCategory",
          foreignField: "_id",
          as: "cat1",
        },
      },
      { $unwind: { path: "$cat1", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "cat1.parentCategory",
          foreignField: "_id",
          as: "cat2",
        },
      },
      { $unwind: { path: "$cat2", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "offers",
          let: { pId: "$_id", c0Id: "$cat0._id", c1Id: "$cat1._id", c2Id: "$cat2._id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$isActive", true] },
                    { $gt: ["$expiresAt", now] },
                    {
                      $or: [
                        { $and: [
                            { $eq: ["$targetModel", "Product"] },
                            { $eq: ["$targetId", "$$pId"] }
                        ]},
                        { $and: [
                            { $eq: ["$targetModel", "Category"] },
                            { $in: ["$targetId", ["$$c0Id", "$$c1Id", "$$c2Id"]] }
                        ]}
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "matchedOffers"
        }
      },
      {
        $addFields: {
          maxDiscount: {
            $reduce: {
              input: "$matchedOffers",
              initialValue: 0,
              in: {
                $let: {
                  vars: {
                    currentDisc: {
                      $cond: [
                        { $eq: ["$$this.discountType", "Percentage"] },
                        { $multiply: ["$salePrice", { $divide: ["$$this.discountValue", 100] }] },
                        "$$this.discountValue"
                      ]
                    }
                  },
                  in: { $max: ["$$value", "$$currentDisc"] }
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          bestOffer: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$matchedOffers",
                  as: "off",
                  cond: {
                    $eq: [
                      {
                        $cond: [
                          { $eq: ["$$off.discountType", "Percentage"] },
                          { $multiply: ["$salePrice", { $divide: ["$$off.discountValue", 100] }] },
                          "$$off.discountValue"
                        ]
                      },
                      "$maxDiscount"
                    ]
                  }
                }
              },
              0
            ]
          }
        }
      },
      {
        $addFields: {
          bestOfferValue: { $ifNull: ["$bestOffer.discountValue", 0] },
          bestOfferType: { $ifNull: ["$bestOffer.discountType", "Percentage"] }
        }
      },
      {
        $addFields: {
          validDiscount: {
            $cond: [
              { $gt: ["$maxDiscount", { $multiply: ["$salePrice", 0.5] }] },
              0, // Reject if > 50%
              "$maxDiscount",
            ],
          },
        },
      },
      {
        $addFields: {
          hasOffer: { 
            $or: [
              { $gt: ["$validDiscount", 0] },
              { $gt: ["$regularPrice", "$salePrice"] }
            ]
          },
          effectivePrice: { $subtract: ["$salePrice", "$validDiscount"] },
        },
      },
    ];


    const priceMatchStage = [];
    if (minPrice || maxPrice) {
      const priceQuery = { effectivePrice: {} };
      if (minPrice) priceQuery.effectivePrice.$gte = Number(minPrice);
      if (maxPrice) priceQuery.effectivePrice.$lte = Number(maxPrice);
      priceMatchStage.push({ $match: priceQuery });
    }

    // 4. Count Pipeline (Now includes offer calculation for correct price filtering)
    const countPipeline = [
      { $match: matchQuery },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.sizes": {
            $elemMatch: { status: "Active", isBlocked: false },
          },
        },
      },
      ...offerCalculationStages,
      ...priceMatchStage,
      { $count: "total" },
    ];

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / limit);

    // 5. Main Fetch Pipeline
    let pipeline = [
      { $match: matchQuery },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.sizes": {
            $elemMatch: { status: "Active", isBlocked: false },
          },
        },
      },
      ...offerCalculationStages,
      ...priceMatchStage,
    ];

    // 6. Sort
    let sortOption = { createdAt: -1 };
    switch (sort) {
      case "priceLowHigh":
        sortOption = { effectivePrice: 1 };
        break;
      case "priceHighLow":
        sortOption = { effectivePrice: -1 };
        break;
      case "az":
        sortOption = { productName: 1 };
        break;
      case "za":
        sortOption = { productName: -1 };
        break;
      case "categoryAZ":
        sortOption = { "cat0.name": 1 };
        break;
      case "categoryZA":
        sortOption = { "cat0.name": -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
    }
    pipeline.push({ $sort: sortOption });

    // 7. Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const variantItems = await Product.aggregate(pipeline);


    // 9. Process sidebar options (Distinct)
    const brands = await Product.distinct("brand", {
      category: { $in: activeCategoryIds },
      isDeleted: false,
      isBlocked: false,
    });

    const colors = await Product.distinct("variants.color", {
      category: { $in: activeCategoryIds },
      isDeleted: false,
      isBlocked: false,
    });

    // 10. OFFER MATH & FORMATTING
    // 10. Process Results
    const parsedProducts = variantItems.map((vItem) => {
      return {
        ...vItem,
        category: vItem.cat0,
        hasOffer: vItem.validDiscount > 0,
        discountedPrice: Math.round(vItem.effectivePrice),
        offerType: vItem.bestOfferType,
        offerValue: vItem.bestOfferValue,
        offerDiscount: vItem.validDiscount > 0 ? Math.round((vItem.validDiscount / vItem.salePrice) * 100) : 0,
        status: (vItem.variants.sizes || []).some(s => s.status === "Active" && s.quantity > 0) ? "Available" : "Out of Stock"
      };
    });


    const isAjax = req.query.ajax === "true" && req.xhr;
    const viewPath = isAjax ? "partials/_shop_content_wrapper" : "user/shop";

    res.render(viewPath, {
      pageTitle: selectedCategoryName || genderFilter || "Shop",
      products: parsedProducts,
      currentPage: page,
      totalPages,
      totalProducts,
      activeMenu: genderFilter
        ? genderFilter === "Men"
          ? "men"
          : "women"
        : "shop",
      search: search || "",
      selectedSort: sort || "newest",
      selectedCategory: category || "",
      selectedBrand: Array.isArray(brand) ? brand : brand ? [brand] : [],
      selectedColor: Array.isArray(color) ? color : color ? [color] : [],
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      categories: sidebarCategories,
      brands,
      colors: colors.filter((c) => c),
      currentQuery: req.query,
      genderFilter,
    });
  } catch (error) {
    console.error("Error loading shop page:", error);
    res.status(500).render("user/shop", {
      pageTitle: "Shop",
      products: [],
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      activeMenu: "shop",
      error: "Failed to load products",
      search: "",
      selectedSort: "",
      selectedCategory: "",
      selectedBrand: [],
      selectedColor: [],
      minPrice: "",
      maxPrice: "",
      categories: [],
      brands: [],
      colors: [],
      currentQuery: {},
    });
  }
};

const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    // Basic ID format validation
    if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(404).render("user/shop", {
        pageTitle: "Shop",
        products: [],
        currentPage: 1,
        totalPages: 1,
        totalProducts: 0,
        activeMenu: "shop",
        search: "",
        selectedSort: "",
        selectedCategory: "",
        selectedBrand: [],
        selectedColor: [],
        minPrice: "",
        maxPrice: "",
        categories: [],
        brands: [],
        colors: [],
        currentQuery: {},
        error: "Product not found.",
      });
    }

    // Fetch Product (ensure not soft-deleted or blocked)
    const product = await Product.findOne({
      _id: productId,
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] }, // Allow Out of Stock for badge, but block others
    }).populate({
      path: "category",
      populate: { path: "parentCategory" },
    });

    if (!product) {
      console.log("Product not found or blocked:", productId);
      return res.redirect("/shop");
    }

    // Fetch Related Products (Same category, excluding current product, only valid ones)
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isBlocked: false,
      variants: {
        $elemMatch: {
          sizes: { $elemMatch: { status: "Active", isBlocked: false } },
        },
      },
    })
      .limit(4)
      .populate("category");

    // ==== OFFER MATH CALCULATION (Main Product) ====
    let pObj = product.toObject();
    
    // Helper to calculate best offer from a set of options
    const getBestPrice = (basePrice, offers) => {
      let bestPrice = basePrice;
      let effectiveOffer = { type: 'Percentage', value: 0 };

      offers.forEach(opt => {
        if (!opt) return;
        const discount = opt.type === 'Percentage' 
          ? (basePrice * (opt.value / 100))
          : opt.value;
        
        // Skip if discount > 50%
        if (discount > basePrice * 0.5) return;

        const currentPrice = basePrice - discount;
        
        if (currentPrice < bestPrice) {
          bestPrice = currentPrice;
          effectiveOffer = opt;
        }
      });
      return { bestPrice, effectiveOffer };
    };

    const pOption = { type: pObj.offerType || 'Percentage', value: pObj.offerValue || 0 };
    const cOptionDirect = pObj.category ? { type: pObj.category.offerType || 'Percentage', value: pObj.category.offerValue || 0 } : null;
    const cOptionParent = pObj.category && pObj.category.parentCategory ? { type: pObj.category.parentCategory.offerType || 'Percentage', value: pObj.category.parentCategory.offerValue || 0 } : null;

    const { bestPrice, effectiveOffer } = getBestPrice(pObj.salePrice, [pOption, cOptionDirect, cOptionParent]);

    if (bestPrice < pObj.salePrice) {
      pObj.hasOffer = true;
      pObj.offerType = effectiveOffer.type;
      pObj.offerValue = effectiveOffer.value;
      pObj.offerDiscount = effectiveOffer.type === 'Percentage' ? effectiveOffer.value : Math.round(((pObj.salePrice - bestPrice) / pObj.salePrice) * 100);
      pObj.discountedPrice = Math.round(bestPrice);

      pObj.variants.forEach((variant) => {
        variant.sizes.forEach((size) => {
          const sPrice = effectiveOffer.type === 'Percentage'
            ? size.salePrice - (size.salePrice * (effectiveOffer.value / 100))
            : Math.max(0, size.salePrice - effectiveOffer.value);
          size.discountedPrice = Math.round(sPrice);
        });
      });
    } else {
      pObj.hasOffer = false;
      pObj.discountedPrice = pObj.salePrice;
      pObj.variants.forEach((variant) => {
        variant.sizes.forEach((size) => {
          size.discountedPrice = size.salePrice;
        });
      });
    }

    // Replace JSON to be used by frontend script
    const productDataJson = JSON.stringify(pObj || {}).replace(/</g, "\\u003c");
    // ================================

    // ==== OFFER MATH CALCULATION (Related Products) ====
    const parsedRelated = relatedProducts.map((rp) => {
      let rObj = rp.toObject();
      const rpOption = { type: rObj.offerType || 'Percentage', value: rObj.offerValue || 0 };
      // Reuse the same category options as they share the same category
      const { bestPrice: rpBestPrice, effectiveOffer: rpEff } = getBestPrice(rObj.salePrice, [rpOption, cOptionDirect, cOptionParent]);

      if (rpBestPrice < rObj.salePrice) {
        rObj.hasOffer = true;
        rObj.offerDiscount = rpEff.type === 'Percentage' ? rpEff.value : Math.round(((rObj.salePrice - rpBestPrice) / rObj.salePrice) * 100);
        rObj.discountedPrice = Math.round(rpBestPrice);
      } else {
        rObj.hasOffer = false;
        rObj.discountedPrice = rObj.salePrice;
      }
      return rObj;
    });
    // ================================

    const isGlobalSoldOut =
      pObj.status === "Out of Stock" || pObj.totalStock <= 0;

    // DEBUG: Check user wishlist state
    if (req.user) {
      console.log(
        `DEBUG: ProductDetail - UserID: ${req.user._id}, Wishlist Count: ${req.user.wishlist ? req.user.wishlist.length : "undefined"}`,
      );
      if (req.user.wishlist) {
        const inWishlist = req.user.wishlist.some(
          (id) => id.toString() === productId,
        );
        console.log(`DEBUG: Product ${productId} in wishlist? ${inWishlist}`);
      }
    }

    res.render("user/product-detail", {
      pageTitle: pObj.productName,
      product: pObj,
      productDataJson,
      relatedProducts: parsedRelated,
      activeMenu: "shop",
      user: req.user,
      isGlobalSoldOut,
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.status(500).redirect("/shop");
  }
};

const getOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const { search, sort, category, brand, minPrice, maxPrice, color, gender } =
      req.query;

    // 1. Get Active Categories
    const activeCategoriesList = await Category.findActiveCategories();
    const activeCategoryIds = activeCategoriesList.map((c) => c._id);

    const genderFilter = gender || null;

    // 2. Build matchQuery for basic filters
    let selectedCategoryName = "";
    const matchQuery = {
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] },
      category: { $in: activeCategoryIds },
    };

    if (category) {
      const activeCat = activeCategoriesList.find(c => c._id.toString() === category.toString());
      if (activeCat) {
          matchQuery.category = activeCat._id;
          selectedCategoryName = activeCat.name;
      }
    }

    // DELETED: matchQuery.gender = genderFilter;
    // Gender restriction is already handled by activeCategoryIds filter above.


    if (brand) {
      const brandList = Array.isArray(brand) ? brand : [brand];
      matchQuery.brand = { $in: brandList };
    }

    if (color) {
      const colorList = Array.isArray(color) ? color : [color];
      matchQuery["variants.color"] = { $in: colorList.map((c) => new RegExp(c, "i")) };
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(safeSearch, "i");
      const matchedCatIds = activeCategoriesList
        .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        .map((c) => c._id);
      matchQuery.$or = [
        { productName: searchRegex },
        { description: searchRegex },
        { brand: searchRegex },
        { model: searchRegex },
        { category: { $in: matchedCatIds } },
        { "variants.color": searchRegex },
      ];
    }

    // 4. Define Offer Calculation Stages (Dynamic Lookup)
    const now = new Date();
    const offerCalculationStages = [
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "cat0",
        },
      },
      { $unwind: { path: "$cat0", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "cat0.parentCategory",
          foreignField: "_id",
          as: "cat1",
        },
      },
      { $unwind: { path: "$cat1", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "cat1.parentCategory",
          foreignField: "_id",
          as: "cat2",
        },
      },
      { $unwind: { path: "$cat2", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "offers",
          let: { pId: "$_id", c0Id: "$cat0._id", c1Id: "$cat1._id", c2Id: "$cat2._id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$isActive", true] },
                    { $gt: ["$expiresAt", now] },
                    {
                      $or: [
                        { $and: [
                            { $eq: ["$targetModel", "Product"] },
                            { $eq: ["$targetId", "$$pId"] }
                        ]},
                        { $and: [
                            { $eq: ["$targetModel", "Category"] },
                            { $in: ["$targetId", ["$$c0Id", "$$c1Id", "$$c2Id"]] }
                        ]}
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "matchedOffers"
        }
      },
      {
        $addFields: {
          maxDiscount: {
            $reduce: {
              input: "$matchedOffers",
              initialValue: 0,
              in: {
                $let: {
                  vars: {
                    currentDisc: {
                      $cond: [
                        { $eq: ["$$this.discountType", "Percentage"] },
                        { $multiply: ["$salePrice", { $divide: ["$$this.discountValue", 100] }] },
                        "$$this.discountValue"
                      ]
                    }
                  },
                  in: { $max: ["$$value", "$$currentDisc"] }
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          bestOffer: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$matchedOffers",
                  as: "off",
                  cond: {
                    $eq: [
                      {
                        $cond: [
                          { $eq: ["$$off.discountType", "Percentage"] },
                          { $multiply: ["$salePrice", { $divide: ["$$off.discountValue", 100] }] },
                          "$$off.discountValue"
                        ]
                      },
                      "$maxDiscount"
                    ]
                  }
                }
              },
              0
            ]
          }
        }
      },
      {
        $addFields: {
          bestOfferValue: { $ifNull: ["$bestOffer.discountValue", 0] },
          bestOfferType: { $ifNull: ["$bestOffer.discountType", "Percentage"] }
        }
      },
      {
        $addFields: {
          validDiscount: {
            $cond: [
              { $gt: ["$maxDiscount", { $multiply: ["$salePrice", 0.5] }] },
              0, // Reject if > 50%
              "$maxDiscount",
            ],
          },
        },
      },
      {
        $addFields: {
          hasOffer: { 
            $or: [
              { $gt: ["$validDiscount", 0] },
              { $gt: ["$regularPrice", "$salePrice"] }
            ]
          },
          effectivePrice: { $subtract: ["$salePrice", "$validDiscount"] },
        },
      },
    ];


    const priceMatchStage = [];
    if (minPrice || maxPrice) {
      const priceQuery = { effectivePrice: {} };
      if (minPrice) priceQuery.effectivePrice.$gte = Number(minPrice);
      if (maxPrice) priceQuery.effectivePrice.$lte = Number(maxPrice);
      priceMatchStage.push({ $match: priceQuery });
    }

    // 4. Offer-Specific Filter Stage
    // We want products that have either a specialized offer OR a general discount
    const activeOfferFilterStage = [{ $match: { hasOffer: true } }];


    // 5. Count Pipeline
    const countPipeline = [
      { $match: matchQuery },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.sizes": {
            $elemMatch: { status: "Active", isBlocked: false },
          },
        },
      },
      ...offerCalculationStages,
      ...activeOfferFilterStage,
      ...priceMatchStage,
      { $count: "total" },
    ];

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / limit);

    // 6. Products Pipeline
    let pipeline = [
      { $match: matchQuery },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.sizes": {
            $elemMatch: { status: "Active", isBlocked: false },
          },
        },
      },
      ...offerCalculationStages,
      ...activeOfferFilterStage,
      ...priceMatchStage,
    ];

    // 7. Sort
    let sortOption = { createdAt: -1 };
    switch (sort) {
      case "priceLowHigh":
        sortOption = { effectivePrice: 1 };
        break;
      case "priceHighLow":
        sortOption = { effectivePrice: -1 };
        break;
      case "az":
        sortOption = { productName: 1 };
        break;
      case "za":
        sortOption = { productName: -1 };
        break;
      case "categoryAZ":
        sortOption = { "cat0.name": 1 };
        break;
      case "categoryZA":
        sortOption = { "cat0.name": -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
    }
    pipeline.push({ $sort: sortOption });

    // 8. Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const variantItems = await Product.aggregate(pipeline);

    // 9. Sidebars
    const baseOfferFilter = {
      isDeleted: false,
      isBlocked: false,
      category: { $in: activeCategoryIds },
    };
    const brands = await Product.distinct("brand", baseOfferFilter);
    const colors = await Product.distinct("variants.color", baseOfferFilter);
    
    // Fetch categories for sidebar in Offers page
    const categoriesInUse = await Product.distinct("category", baseOfferFilter);
    let sidebarCategories = activeCategoriesList.filter((c) =>
      categoriesInUse.some((inUseId) => inUseId.toString() === c._id.toString()),
    );

    // 10. Final Mapping
    const parsedProducts = variantItems.map((vItem) => {
      return {
        ...vItem,
        category: vItem.cat0,
        hasOffer: vItem.validDiscount > 0, // FIXED: Only true if specialized offer exists
        discountedPrice: Math.round(vItem.effectivePrice),
        offerType: vItem.bestOfferType,
        offerValue: vItem.bestOfferValue,
        offerDiscount: vItem.validDiscount > 0 ? Math.round((vItem.validDiscount / vItem.salePrice) * 100) : 0,
        status: (vItem.variants.sizes || []).some(s => s.status === "Active" && s.quantity > 0) ? "Available" : "Out of Stock"
      };
    });

    const isAjax = req.query.ajax === "true" && req.xhr;
    const viewPath = isAjax ? "partials/_shop_content_wrapper" : "user/offers";

    res.render(viewPath, {
      pageTitle: "Offers & Deals",
      products: parsedProducts,
      currentPage: page,
      totalPages,
      totalProducts,
      activeMenu: "offers",
      search: search || "",
      selectedSort: sort || "newest",
      selectedCategory: category || "",
      selectedBrand: Array.isArray(brand) ? brand : brand ? [brand] : [],
      selectedColor: Array.isArray(color) ? color : color ? [color] : [],
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      categories: sidebarCategories,
      brands,
      colors: colors.filter((c) => c),
      currentQuery: req.query,
      genderFilter,
    });
  } catch (error) {
    console.error("Error loading offers page:", error);
    res.status(500).render("user/offers", {
      pageTitle: "Offers & Deals",
      products: [],
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      activeMenu: "offers",
      error: "Failed to load offers",
      search: "",
      selectedSort: "",
      selectedCategory: "",
      selectedBrand: [],
      selectedColor: [],
      minPrice: "",
      maxPrice: "",
      categories: [],
      brands: [],
      colors: [],
      currentQuery: {},
    });
  }
};


const getAbout = (req, res) => {
  res.render("user/about", {
    pageTitle: "About Us",
    activeMenu: "about",
    user: req.user,
  });
};

const getContact = (req, res) => {
  res.render("user/contact", {
    pageTitle: "Contact Us",
    activeMenu: "contact",
    user: req.user,
  });
};

const postContact = async (req, res) => {
  try {
    const { fname, lname, email, subject, message } = req.body;

    // Basic server-side validation (Only First Name and Email are mandatory as per request)
    if (!fname || !email) {
      return res.status(400).json({ success: false, message: "First name and Email are required." });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address." });
    }

    await sendContactEmail({ fname, lname, email, subject, message });

    res.status(200).json({ success: true, message: "Your message has been sent successfully!" });
  } catch (error) {
    console.error("Error in postContact:", error);
    res.status(500).json({ success: false, message: "Failed to send message. Please try again later." });
  }
};

module.exports = {
  getShop,
  getProductDetails,
  getOffers,
  getAbout,
  getContact,
  postContact,
};
