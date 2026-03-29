const bcrypt = require("bcryptjs");

async function testBcrypt() {
  const password = "password123";
  const hash = await bcrypt.hash(password, 10);
  console.log("Hash generated:", hash);
  
  const isMatch = await bcrypt.compare(password, hash);
  console.log("Match check (same library):", isMatch ? "SUCCESS" : "FAIL");

  // Test against a known bcrypt hash if possible
  const knownHash = "$2a$10$abcdefghijklmnopqrstuv"; // invalid but for format check
  try {
      await bcrypt.compare(password, knownHash);
  } catch (e) {
      console.log("Known hash check error (expected for invalid hash):", e.message);
  }
}

testBcrypt();
