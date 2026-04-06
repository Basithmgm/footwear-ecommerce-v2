const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const Role = require('../models/Role');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).populate('role_id');
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
      proxy: true,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;

        // Fetch Phone Number from People API (Requires scope + People API enabled in Google Cloud)
        let phoneFromGoogle = null;
        try {
          const peopleResponse = await fetch(
            'https://people.googleapis.com/v1/people/me?personFields=phoneNumbers',
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (peopleResponse.ok) {
            const peopleData = await peopleResponse.json();
            if (peopleData.phoneNumbers && peopleData.phoneNumbers.length > 0) {
              // Get the first available number
              phoneFromGoogle = peopleData.phoneNumbers[0].value;
            }
          }
        } catch (phoneErr) {
          console.error("Error fetching phone number from Google People API:", phoneErr.message);
          // Don't fail the login if only the phone number fetch fails
        }

        // 1. If user is already logged in, link this Google account to their profile
        if (req.user) {
          // Check if this googleId is already linked to ANOTHER user
          const existingUserWithId = await User.findOne({ googleId });
          if (existingUserWithId) {
            if (existingUserWithId.id === req.user.id) {
              return done(null, req.user); // Already linked to current user
            }
            // Error: Already linked to a different account
            return done(new Error("This Google account is already linked to another user account."), null);
          }

          // Link to current user
          const currentUser = await User.findById(req.user.id);
          currentUser.googleId = googleId;
          currentUser.isGoogleUser = true;

          // Sync phone number only if user doesn't have one yet
          if (phoneFromGoogle && !currentUser.phone_number) {
            currentUser.phone_number = phoneFromGoogle;
          }

          // Sync profile image if desired
          if (!currentUser.image || currentUser.image === '/images/default-avatar.jpg') {
            currentUser.image = profile.photos && profile.photos[0] ? profile.photos[0].value : currentUser.image;
          }
          await currentUser.save();
          
          // Mark as linked for the controller
          req.auth_linked = true;
          return done(null, currentUser);
        }

        // 2. Not logged in: Check if user already has this googleId
        let user = await User.findOne({ googleId });

        if (user) {
          // Update phone number if it's missing on existing account
          if (phoneFromGoogle && !user.phone_number) {
            user.phone_number = phoneFromGoogle;
            await user.save();
          }
          return done(null, user);
        }

        // 3. Check if user exists with the same email but no googleId
        user = await User.findOne({ email });

        if (user) {
          // Link Google ID to existing account
          user.googleId = googleId;
          user.isGoogleUser = true;

          // Sync phone number if missing
          if (phoneFromGoogle && !user.phone_number) {
            user.phone_number = phoneFromGoogle;
          }

          // If the existing user wasn't verified, mark as verified
          if (!user.isVerified) user.isVerified = true;
          await user.save();
          return done(null, user);
        }

        // 4. Create new user
        const userRole = await Role.findOne({ role_name: "user" });
        
        // Referral Code Generation Logic (removed for brevity, keep existing)
        const generateReferralCode = async (emailStr) => {
          const prefix = emailStr.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let isUnique = false;
          let code = '';
          
          while (!isUnique) {
            code = prefix;
            for (let i = 0; i < 4; i++) {
              code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const existing = await User.findOne({ referralCode: code });
            if (!existing) isUnique = true;
          }
          return code;
        };

        const referralCode = await generateReferralCode(email);

        user = new User({
          full_name: profile.displayName,
          email: email,
          googleId: googleId,
          isGoogleUser: true,
          isVerified: true,
          status: "Active",
          role_id: userRole ? userRole._id : undefined,
          phone_number: phoneFromGoogle,
          image: profile.photos && profile.photos[0] ? profile.photos[0].value : '/images/default-avatar.jpg',
          referralCode: referralCode,
          last_login_at: new Date()
        });

        await user.save();
        return done(null, user);
      } catch (err) {
        console.error("Error in Google Strategy:", err);
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
