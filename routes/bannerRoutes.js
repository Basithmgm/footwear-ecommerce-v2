const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const adminAuth = require('../middlewares/adminAuth');

// Admin Banner Routes (Protected)
router.get('/admin/banners', adminAuth, bannerController.getBanners);
router.get('/admin/banners/add', adminAuth, bannerController.getAddBanner);
router.post('/admin/banners/add', adminAuth, bannerController.postAddBanner);
router.get('/admin/banners/edit/:id', adminAuth, bannerController.getEditBanner);
router.post('/admin/banners/edit/:id', adminAuth, bannerController.postEditBanner);
router.post('/admin/banners/delete/:id', adminAuth, bannerController.deleteBanner);
router.post('/admin/banners/settings', adminAuth, bannerController.updateSettings);

module.exports = router;
