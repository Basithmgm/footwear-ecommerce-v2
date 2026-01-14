const mongoose = require('mongoose');
const Role = require('../models/Role');
require('dotenv').config();

const seedRoles = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        console.log("Connected to MongoDB for seeding.");

        const roles = ['user', 'admin'];

        for (const roleName of roles) {
            const exists = await Role.findOne({ role_name: roleName });
            if (!exists) {
                await Role.create({ role_name: roleName });
                console.log(`✅ Role created: ${roleName}`);
            } else {
                console.log(`ℹ️ Role already exists: ${roleName}`);
            }
        }

        console.log("Seeding completed.");
        process.exit();
    } catch (error) {
        console.error("Seeding error:", error);
        process.exit(1);
    }
};

seedRoles();
