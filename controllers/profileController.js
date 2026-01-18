const User = require('../models/User');
const OTP = require('../models/OTP');
const Address = require('../models/Address');
const bcrypt = require('bcryptjs');
const cloudinary = require('../config/cloudinary');

const { sendOTPEmail } = require("../services/emailService");

// Display profile
exports.getProfile = async (req, res) => {
  try {
    // Middleware (authMiddleware) already ensures req.user exists
    const user = req.user;

    // Fetch addresses from separate collection
    const addresses = await Address.find({ user_id: user._id });

    // Attach addresses to user object for the view to use (preserving existing view logic if possible)
    // Or pass them separately. Let's pass separately or mocked onto user for minimal view changes if user.addresses was used.
    // View likely uses `user.addresses`. Let's create a view object.
    const userView = user.toObject();
    userView.addresses = addresses;

    console.log("ProfileController: Rendering for", user.email);

    res.render('profile/display', {
      user: userView,
      success: req.query.success,
      activeMenu: 'profile'
    });
  } catch (err) {
    console.error("Profile rendering error:", err);
    res.status(500).render('profile/display', {
      user: null,
      success: null,
      error: "Error loading profile: " + err.message,
      activeMenu: 'profile'
    });
  }
};

// Edit form
exports.getEditProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.redirect('/login');
    }

    const user = await User.findById(req.user.id);
    res.render('profile/edit', {
      user,
      error: req.query.error || null,
      activeMenu: 'profile'
    });
  } catch (err) {
    res.redirect('/profile?error=' + encodeURIComponent(err.message));
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    // Update basic info - MAP 'name' from form to 'full_name'
    user.full_name = name;

    // Update phone (new schema field name is phone_number, form is phone)
    if (phone !== undefined) {
      user.phone_number = phone;
    }

    // Update profile image if uploaded
    if (req.file) {
      // Delete old image from Cloudinary if it exists
      if (user.image && user.image.includes('cloudinary.com')) {
        try {
          const parts = user.image.split('/upload/');
          if (parts.length === 2) {
            let pathPart = parts[1];
            pathPart = pathPart.replace(/^v\d+\//, ''); // Remove version
            const publicId = pathPart.substring(0, pathPart.lastIndexOf('.'));
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (delErr) {
          console.error("Failed to delete old image from Cloudinary:", delErr);
        }
      }
      // Save new Cloudinary URL
      user.image = req.file.path;
    }

    // Check for email change
    if (email && email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists) {
        return res.redirect('/profile/edit?error=' + encodeURIComponent("Email already in use by another account"));
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      await OTP.deleteMany({ email });

      await OTP.create({
        email: email,
        otp: otpCode,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });

      try {
        await sendOTPEmail(email, otpCode);
      } catch (emailErr) {
        console.error("Error sending OTP:", emailErr);
        return res.redirect('/profile/edit?error=' + encodeURIComponent("Could not send verification email"));
      }

      await user.save();
      return res.redirect(`/profile/verify-email?email=${encodeURIComponent(email)}`);
    }

    await user.save();

    // Update session - REMOVED (Relies on DB fetch)
    // if (req.session.user) {
    //   req.session.user.username = user.full_name;
    // }

    res.redirect('/profile?success=Profile updated successfully');
  } catch (err) {
    console.error("Update error:", err);
    res.redirect('/profile/edit?error=' + encodeURIComponent(err.message));
  }
};

// Get Change Password Page
exports.getChangePassword = (req, res) => {
  res.render('profile/change-password', {
    errors: req.query.error || null,
    activeMenu: 'profile'
  });
};

// Change Password
exports.changeProfilePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.redirect('/profile/change-password?error=' + encodeURIComponent("Current password is incorrect"));
    }

    if (newPassword.length < 6) {
      return res.redirect('/profile/change-password?error=' + encodeURIComponent("New password must be at least 6 characters"));
    }

    if (newPassword !== confirmPassword) {
      return res.redirect('/profile/change-password?error=' + encodeURIComponent("New passwords do not match"));
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.redirect('/profile?success=Password changed successfully');
  } catch (err) {
    console.error("Change password error:", err);
    res.redirect('/profile/change-password?error=' + encodeURIComponent(err.message));
  }
};

// Get Verify Email Page
exports.getVerifyEmail = (req, res) => {
  const email = req.query.email;
  if (!email) return res.redirect('/profile');

  res.render('profile/verify-email', {
    email,
    error: req.query.error || null,
    activeMenu: 'profile'
  });
};

// Verify Email OTP
exports.verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const userId = req.user.id;

    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      return res.redirect(`/profile/verify-email?email=${email}&error=Invalid OTP`);
    }

    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteMany({ email });
      return res.redirect(`/profile/verify-email?email=${email}&error=OTP Expired`);
    }

    const user = await User.findById(userId);
    user.email = email;
    await user.save();

    await OTP.deleteMany({ email });

    // if (req.session.user) {
    //   req.session.user.email = user.email;
    // }

    res.redirect('/profile?success=Email updated successfully');
  } catch (err) {
    console.error("Verify Email OTP error:", err);
    res.redirect('/profile?error=' + encodeURIComponent(err.message));
  }
};

// ==========================================
// ADDRESS MANAGEMENT (New Schema)
// ==========================================

// Get Add Address Page
exports.getAddAddress = (req, res) => {
  res.render('profile/address-add', {
    error: req.query.error || null,
    oldInput: {},
    activeMenu: 'profile'
  });
};

// Post Add Address
exports.postAddAddress = async (req, res) => {
  try {
    const { street, city, state, zip, country, phone } = req.body;
    const userId = req.user.id;

    if (!street || !city || !state || !zip || !country) {
      return res.render('profile/address-add', {
        error: "All fields are required",
        oldInput: req.body
      });
    }

    // Create new Address document
    await Address.create({
      user_id: userId,
      full_address: street, // Mapping 'street' to 'full_address' as generic placeholder
      city,
      state,
      zip_code: zip,
      country,
      phone_number: phone
    });

    res.redirect('/profile?success=Address added successfully');
  } catch (err) {
    console.error("Add address error:", err);
    res.render('profile/address-add', {
      error: "Failed to add address",
      oldInput: req.body,
      activeMenu: 'profile'
    });
  }
};

// Get Edit Address Page
exports.getEditAddress = async (req, res) => {
  try {
    const addressId = req.params.id;

    // Find address directly
    const address = await Address.findById(addressId);

    if (!address) {
      return res.redirect('/profile?error=Address not found');
    }

    // Ensure belongs to user
    if (address.user_id.toString() !== req.user.id) {
      return res.redirect('/profile?error=Unauthorized');
    }

    // Map fields back to view expectations if needed, or update view.
    // View likely uses `address.street`, `address.zip` etc.
    // We will pass the address object and view might need updating if it relies on strict names.
    // We will stick to `address.street` in view Mapping logic:
    const addressView = {
      _id: address._id,
      street: address.full_address,
      city: address.city,
      state: address.state,
      zip: address.zip_code,
      country: address.country,
      phone: address.phone_number
    };

    res.render('profile/address-edit', {
      address: addressView,
      error: req.query.error || null,
      activeMenu: 'profile'
    });
  } catch (err) {
    res.redirect('/profile?error=' + encodeURIComponent(err.message));
  }
};

// Post Edit Address
exports.postEditAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const { street, city, state, zip, country, phone } = req.body;

    const address = await Address.findById(addressId);
    if (!address) {
      return res.redirect('/profile?error=Address not found');
    }

    if (address.user_id.toString() !== req.user.id) {
      return res.redirect('/profile?error=Unauthorized');
    }

    address.full_address = street;
    address.city = city;
    address.state = state;
    address.zip_code = zip;
    address.country = country;
    if (phone) address.phone_number = phone;

    await address.save();
    res.redirect('/profile?success=Address updated successfully');
  } catch (err) {
    console.error("Edit address error:", err);
    res.redirect(`/profile/address/edit/${req.params.id}?error=Failed to update address`);
  }
};

// Delete Address
exports.deleteAddress = async (req, res) => {
  try {
    const addressId = req.params.id;

    const address = await Address.findById(addressId);
    if (!address) {
      return res.redirect('/profile?error=Address not found');
    }

    if (address.user_id.toString() !== req.user.id) {
      return res.redirect('/profile?error=Unauthorized');
    }

    await Address.findByIdAndDelete(addressId);

    res.redirect('/profile?success=Address deleted successfully');
  } catch (err) {
    console.error("Delete address error:", err);
    res.redirect('/profile?error=Failed to delete address');
  }
};

// Set Default Address
// Note: User collection no longer has addresses array to manage default.
// If we want default address logic, we might need a flag on Address model or reference on User.
// The prompted schema for Address did NOT have 'isDefault'.
// We will deprecate this feature or pick the first one as default implicitly for now.
exports.setDefaultAddress = async (req, res) => {
  // Feature removed in new schema unless requested to add back.
  // Or we can add isDefault to Address model?
  // User prompt: "shipping_address collection stores... id, full_address, user_id, city, country, state, zip_code, phone_number"
  // No 'isDefault' mentioned.
  // I will act as if this feature is not supported or implicitly first one.
  res.redirect('/profile');
};
