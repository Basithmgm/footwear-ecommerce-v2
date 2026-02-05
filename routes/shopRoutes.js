const express = require("express");
const router = express.Router();
const shopController = require("../controllers/shopController");

router.get("/shop", shopController.getShop);
router.get("/men", shopController.getShop);
router.get("/women", shopController.getShop);
router.get("/product/:id", shopController.getProductDetails);

module.exports = router;
