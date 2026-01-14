module.exports = function adminAuth(req, res, next) {
    // Check if admin session exists
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.redirect('/admin');
};
