// Middleware to redirect logged-in users away from auth pages
module.exports = (req, res, next) => {
    // If Admin is logged in, redirect to admin dashboard
    if (req.session && req.session.adminId && req.path.startsWith('/admin')) {
        return res.redirect('/admin/users');
    }

    // If User is logged in, redirect to home
    // Check if req.user exists (populated by global middleware) to avoid redirecting if session is stale/user deleted
    if (req.session && req.session.userId && req.user && !req.path.startsWith('/admin')) {
        return res.redirect('/');
    }

    next();
};
