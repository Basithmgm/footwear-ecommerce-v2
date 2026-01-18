module.exports = function adminAuth(req, res, next) {
    // Check if admin session exists (AND explicitly has adminId)
    if (req.session && req.session.isAdmin && req.session.adminId) {
        return next();
    }
    return res.redirect('/admin');
};
