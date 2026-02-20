const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');

router.get('/', checkoutController.getCheckout);
router.post('/place-order', checkoutController.placeOrder);
router.get('/success/:orderId', checkoutController.getOrderSuccess);
router.post('/add-address', checkoutController.addAddress);

module.exports = router;
