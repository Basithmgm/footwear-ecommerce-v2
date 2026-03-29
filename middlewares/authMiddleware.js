
// This middleware assumes you set req.session.userId during login
// in your authController.postLogin, and that app.js middleware populates req.user

module.exports = function auth(req, res, next) {
  // 1. Check if session exists
  if (req.session && req.session.userId) {

    // 2. Check if DB user was successfully fetched by app.js middleware
    if (req.user) {
      return next();
    }

    // 3. Zombie Session Detected (Session exists, but User not found in DB)
    console.warn(`Zombie session detected for userId: ${req.session.userId}. Destroying session.`);

    req.session.destroy(err => {
      if (err) console.error("Session destroy error:", err);
      // clear cookie manually if needed, usually session.destroy is enough
      res.clearCookie('connect.sid');
      return res.redirect("/login?error=" + encodeURIComponent("Session invalid. Please login again."));
    });

  } else {
    // 4. No session at all
    // Check if it's an AJAX/Fetch request
    if (req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"))) {
      return res.status(401).json({ success: false, message: "Session expired. Please login again." });
    }
    return res.redirect("/login");
  }
};
