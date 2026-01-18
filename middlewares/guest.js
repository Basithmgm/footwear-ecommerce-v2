// Middleware to redirect logged-in users away from auth pages
module.exports = (req, res, next) => {
    // If Admin is logged in, redirect to admin dashboard
    if (req.session && req.session.adminId && req.path.startsWith('/admin')) {
        return res.redirect('/admin/users');
    }

    // If User is logged in, redirect to home
    if (req.session && req.session.userId && !req.path.startsWith('/admin')) {
        return res.redirect('/');
    }

    next();
};
