const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    const isAdmin = req.originalUrl.startsWith('/admin');
    const homeLink = isAdmin ? '/admin/users' : '/';
    const homeText = isAdmin ? 'Return to Users' : 'Go Back Home';

    // Pass to error handler if we want JSON, otherwise render 404 view directly
    if (req.accepts('html')) {
        return res.render('404', {
            pageTitle: 'Page Not Found',
            path: req.originalUrl,
            homeLink,
            homeText
        });
    }
    next(error);
};

const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);

    console.error("❌ Global Error Handler:", err.stack);

    const isAdmin = req.originalUrl.startsWith('/admin');
    const homeLink = isAdmin ? '/admin/users' : '/';
    const homeText = isAdmin ? 'Return to Users' : 'Return to Home';

    if (req.accepts('html')) {
        res.render('error', {
            pageTitle: 'Error Detected',
            message: err.message || "Something went wrong on our end.",
            statusCode: statusCode,
            stack: process.env.NODE_ENV === 'production' ? null : err.stack,
            homeLink,
            homeText
        });
    } else {
        res.json({
            message: err.message,
            stack: process.env.NODE_ENV === 'production' ? null : err.stack,
        });
    }
};

module.exports = { notFound, errorHandler };
