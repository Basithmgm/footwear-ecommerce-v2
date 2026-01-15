const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const Address = require('../models/Address');
require('dotenv').config();

const migrateUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        console.log("Connected to MongoDB for migration.");

        const userRole = await Role.findOne({ role_name: 'user' });
        const adminRole = await Role.findOne({ role_name: 'admin' });

        const usersRaw = await mongoose.connection.db.collection('users').find({}).toArray();
        console.log(`Checking migration for ${usersRaw.length} users.`);

        for (const rawUser of usersRaw) {
            const updates = {};
            const unsets = {};

            // Map name -> full_name
            if (rawUser.name && !rawUser.full_name) {
                updates.full_name = rawUser.name;
                unsets.name = "";
            } else if (!rawUser.full_name) {
                updates.full_name = "User " + rawUser.email.split('@')[0];
            }

            // Map profileImage -> image
            if (rawUser.profileImage && !rawUser.image) {
                updates.image = rawUser.profileImage;
                unsets.profileImage = "";
            } else if (!rawUser.image) {
                updates.image = '/images/default-avatar.jpg';
            }

            // Map isBlocked -> status
            if (rawUser.hasOwnProperty('isBlocked') && !rawUser.status) {
                updates.status = rawUser.isBlocked ? 'Blocked' : 'Active';
                unsets.isBlocked = "";
            } else if (!rawUser.status) {
                updates.status = 'Active';
            }

            // Assign role_id
            if (!rawUser.role_id) {
                // Check if admin email
                const isAdmin = rawUser.email === 'admin@footwear.com';
                updates.role_id = isAdmin ? adminRole._id : userRole._id;
            }

            // Move Addresses
            if (rawUser.addresses?.length > 0) {
                console.log(`Moving ${rawUser.addresses.length} addresses for ${rawUser.email}`);
                for (const addr of rawUser.addresses) {
                    // Check if already moved (idempotency check by street/zip)
                    const exists = await Address.findOne({
                        user_id: rawUser._id,
                        full_address: addr.street,
                        zip_code: addr.zip || addr.zip_code
                    });

                    if (!exists) {
                        await Address.create({
                            user_id: rawUser._id,
                            full_address: addr.street || "Unknown Street",
                            city: addr.city || "Unknown City",
                            state: addr.state || "Unknown State",
                            zip_code: addr.zip || addr.zip_code || "000000",
                            country: addr.country || "Unknown Country",
                            phone_number: addr.phone || "0000000000"
                        });
                    }
                }
                unsets.addresses = "";
            }

            if (Object.keys(updates).length > 0 || Object.keys(unsets).length > 0) {
                const finalUpdate = {};
                if (Object.keys(updates).length > 0) finalUpdate.$set = updates;
                if (Object.keys(unsets).length > 0) finalUpdate.$unset = unsets;

                await mongoose.connection.db.collection('users').updateOne(
                    { _id: rawUser._id },
                    finalUpdate
                );
                console.log(`✅ Migrated user and addresses: ${rawUser.email}`);
            } else {
                console.log(`ℹ️ User already up to date: ${rawUser.email}`);
            }
        }

        console.log("Migration completed successfully.");
        process.exit();
    } catch (error) {
        console.error("Migration error:", error);
        process.exit(1);
    }
};

migrateUsers();
