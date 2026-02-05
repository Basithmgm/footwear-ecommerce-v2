require('dotenv').config({ path: '../.env' }); // Adjust path if running from scripts/ dir
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
};

const createAdmin = async () => {
    await connectDB();

    try {
        // 1. Ensure Admin Role Exists
        let adminRole = await Role.findOne({ role_name: 'admin' });
        if (!adminRole) {
            console.log("Admin role not found. Creating...");
            adminRole = await Role.create({ role_name: 'admin' });
            console.log("Admin role created.");
        } else {
            console.log("Admin role already exists.");
        }

        // 2. Ensure Admin User Exists
        const email = 'admin@footwear.com';
        let adminUser = await User.findOne({ email });

        if (adminUser) {
            console.log("Admin user already exists. Updating password/role just in case...");
            // Optional: Update password here if you want to force reset it
            const salt = await bcrypt.genSalt(10);
            adminUser.password = await bcrypt.hash('admin123', salt);
            adminUser.role_id = adminRole._id;
            adminUser.isVerified = true;
            adminUser.status = 'Active';
            await adminUser.save();
            console.log("Admin user updated with password 'admin123'.");
        } else {
            console.log("Creating admin user...");
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);

            adminUser = await User.create({
                full_name: 'Super Admin',
                email: email,
                password: hashedPassword,
                role_id: adminRole._id,
                isVerified: true,
                status: 'Active'
            });
            console.log("Admin user created successfully.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Error creating admin:", err);
        process.exit(1);
    }
};

createAdmin();
