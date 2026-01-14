// middleware/auth.js
const User = require('../models/User');

const auth = async (req, res, next) => {
  if (req.session?.userId) {
    try {
      req.user = await User.findById(req.session.userId).select('-password');
      next();
    } catch (err) {
      res.redirect('/auth/login');
    }
  } else {
    res.redirect('/auth/login');
  }
};

module.exports = auth;
