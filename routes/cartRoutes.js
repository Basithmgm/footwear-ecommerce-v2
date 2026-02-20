const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

router.get('/', cartController.getCart);
router.get('/count', cartController.getCartCount);
router.post('/add', cartController.addToCart);
router.post('/update-quantity', cartController.updateQuantity);
router.post('/remove', cartController.removeFromCart);

module.exports = router;
