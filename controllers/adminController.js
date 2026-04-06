const User = require('../models/User');

exports.getLogin = (req, res) => {
    // If already logged in as admin, redirect to dashboard (or home for now)
    if (req.session.isAdmin) {
        return res.redirect('/admin/users');
    }

    res.render('auth/admin/login', {
        pageTitle: 'Admin Login',
        error: null
    });
};

const bcrypt = require('bcryptjs');

exports.postLogin = async (req, res) => {
    try {
        let { email, password } = req.body;

        // Defensive: trim and lowercase email manually
        email = email ? email.trim().toLowerCase() : "";

        console.log("DEBUG: Admin Login Attempt for Email:", email);

        // Find user by email and populate role
        const user = await User.findOne({ email }).populate('role_id');
        console.log("DEBUG: Admin Query Result:", user ? `Found (ID: ${user._id}, Role: ${user.role_id?.role_name || "None"})` : "NOT FOUND");

        if (!user) {
            return res.render('auth/admin/login', {
                pageTitle: 'Admin Login',
                error: 'Invalid admin credentials'
            });
        }

        // Check if user has admin role
        if (!user.role_id || user.role_id.role_name !== 'admin') {
            console.log("❌ Admin Login Failed: Not an admin");
            return res.render('auth/admin/login', {
                pageTitle: 'Admin Login',
                error: 'Access denied. Administrator privileges required.'
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // Set admin session
            req.session.isAdmin = true;
            req.session.adminId = user._id; // SEPARATE KEY for admin
            req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours persistent admin session

            console.log("✅ Admin Logged In:", email);

            // Redirect to user management
            return res.redirect('/admin/users');
        } else {
            console.log("❌ Admin Login Failed: Incorrect password");
            return res.render('auth/admin/login', {
                pageTitle: 'Admin Login',
                error: 'Invalid admin credentials'
            });
        }
    } catch (err) {
        console.error("Admin Login Error:", err);
        return res.render('auth/admin/login', {
            pageTitle: 'Admin Login',
            error: 'Something went wrong. Please try again.'
        });
    }
};

exports.logout = (req, res) => {
    // Only clear admin session
    if (req.session.isAdmin) {
        delete req.session.isAdmin;
        delete req.session.adminId;
    }
    // Set success message for login page
    req.session.successMessage = "Logged out successfully";
    res.redirect('/admin');
};

const Role = require('../models/Role');

// Get Users with Pagination, Search, Sort
exports.getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const search = req.query.search || "";

        // Find the 'admin' role to exclude it
        const adminRole = await Role.findOne({ role_name: 'admin' });
        const adminRoleId = adminRole ? adminRole._id : null;

        const query = {};

        // Exclude admin role if found
        if (adminRoleId) {
            query.role_id = { $ne: adminRoleId };
        }

        if (search) {
            query.$and = [
                { role_id: { $ne: adminRoleId } },
                {
                    $or: [
                        { full_name: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } }
                    ]
                }
            ];
        }

        // Sort descending (latest first) by createdAt
        const users = await User.find(query)
            .sort({ created_at: -1 })
            .populate('role_id')
            .skip((page - 1) * limit)
            .limit(limit);

        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limit);

        res.render('auth/admin/users', {
            users,
            currentPage: page,
            totalPages,
            search,
            totalUsers,
            path: '/admin/users' // For sidebar active state
        });
    } catch (err) {
        console.error("Admin Get Users Error:", err);
        res.status(500).send("Server Error: " + err.message);
    }
};

// Block User
exports.blockUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);
        if (!user) {
            req.session.errorMessage = "User not found";
            return res.redirect('/admin/users');
        }

        console.log(`🔒 ADMIN ACTION: Blocking user ${user.email} (ID: ${userId})`);
        user.status = 'Blocked';
        await user.save();

        req.session.successMessage = "User blocked successfully";
        
        // Ensure session is saved BEFORE redirect
        req.session.save((err) => {
            if (err) console.error("Session save error on block:", err);
            res.redirect('/admin/users');
        });
    } catch (err) {
        console.error("Block User Error:", err);
        res.redirect('/admin/users');
    }
};

// Unblock User
exports.unblockUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);
        if (!user) {
            req.session.errorMessage = "User not found";
            return res.redirect('/admin/users');
        }

        console.log(`🔓 ADMIN ACTION: Unblocking user ${user.email} (ID: ${userId})`);
        user.status = 'Active';
        await user.save();

        req.session.successMessage = "User unblocked successfully";

        // Ensure session is saved BEFORE redirect
        req.session.save((err) => {
            if (err) console.error("Session save error on unblock:", err);
            res.redirect('/admin/users');
        });
    } catch (err) {
        console.error("Unblock User Error:", err);
        res.redirect('/admin/users');
    }
};
