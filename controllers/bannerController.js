const Banner = require('../models/Banner');
const BannerSetting = require('../models/BannerSetting');

// Get All Banners
// Get All Banners
exports.getBanners = async (req, res) => {
    try {
        const banners = await Banner.find().sort({ order: 1, createdAt: -1 });

        // Fetch settings
        const settings = await BannerSetting.find({ key: { $in: ['bannerScrollSpeed', 'bannerBackgroundColor', 'bannerTextColor'] } });

        const getSetting = (k, def) => {
            const s = settings.find(x => x.key === k);
            return s ? s.value : def;
        };

        res.render('admin/banner/list', {
            banners,
            path: '/admin/banners',
            success: res.locals.successMessage || null,
            error: req.query.error,
            bannerSpeed: getSetting('bannerScrollSpeed', 20),
            bannerBgColor: getSetting('bannerBackgroundColor', '#88c8bc'),
            bannerTextColor: getSetting('bannerTextColor', '#ffffff')
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=Server Error');
    }
};

// Update Settings
exports.updateSettings = async (req, res) => {
    try {
        const { bannerSpeed, bannerBgColor, bannerTextColor } = req.body;

        const updates = [
            { key: 'bannerScrollSpeed', value: parseInt(bannerSpeed), desc: 'Speed of banner marquee in seconds' },
            { key: 'bannerBackgroundColor', value: bannerBgColor, desc: 'Background color of banner' },
            { key: 'bannerTextColor', value: bannerTextColor, desc: 'Text color of banner' }
        ];

        for (const up of updates) {
            await BannerSetting.findOneAndUpdate(
                { key: up.key },
                {
                    key: up.key,
                    value: up.value,
                    description: up.desc
                },
                { upsert: true, new: true }
            );
        }

        req.session.successMessage = "Settings updated successfully";
        res.redirect('/admin/banners');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/banners?error=Failed to update settings');
    }
};

// Get Add Page
exports.getAddBanner = (req, res) => {
    res.render('admin/banner/add', {
        path: '/admin/banners',
        error: null,
        oldInput: {}
    });
};

// Post Add Banner
exports.postAddBanner = async (req, res) => {
    try {
        const { title, link, order, isActive } = req.body;
        await Banner.create({
            title,
            link: link || '/shop',
            order: order || 0,
            isActive: isActive === 'on'
        });
        req.session.successMessage = "Banner added successfully";
        res.redirect('/admin/banners');
    } catch (err) {
        console.error(err);
        res.render('admin/banner/add', {
            path: '/admin/banners',
            error: 'Failed to add banner',
            oldInput: req.body
        });
    }
};

// Get Edit Page
exports.getEditBanner = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) return res.redirect('/admin/banners?error=Banner not found');

        res.render('admin/banner/edit', {
            path: '/admin/banners',
            banner,
            error: null
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/banners?error=Server Error');
    }
};

// Post Edit Banner
exports.postEditBanner = async (req, res) => {
    try {
        const { title, link, order, isActive } = req.body;
        await Banner.findByIdAndUpdate(req.params.id, {
            title,
            link: link || '/shop',
            order: order || 0,
            isActive: isActive === 'on'
        });
        req.session.successMessage = "Banner updated successfully";
        res.redirect('/admin/banners');
    } catch (err) {
        console.error(err);
        res.redirect(`/admin/banners/edit/${req.params.id}?error=Update Failed`);
    }
};

// Delete Banner
exports.deleteBanner = async (req, res) => {
    try {
        await Banner.findByIdAndDelete(req.params.id);
        req.session.successMessage = "Banner deleted successfully";
        res.redirect('/admin/banners');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/banners?error=Delete Failed');
    }
};
