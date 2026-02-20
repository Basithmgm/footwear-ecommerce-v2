const express = require("express");
const router = express.Router();
const shopController = require("../controllers/shopController");

const noCache = require("../middlewares/noCache");

router.get("/shop", shopController.getShop);
router.get("/men", shopController.getShop);
router.get("/women", shopController.getShop);
router.get("/product/:id", noCache, shopController.getProductDetails);

module.exports = router;
