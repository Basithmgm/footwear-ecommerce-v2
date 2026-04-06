// services/emailService.js
const nodemailer = require("nodemailer");

const isDev = process.env.NODE_ENV !== "production";

let transporter;

if (!isDev) {
  // Production: real Gmail SMTP using app password
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD, // 16-char app password
    },
  });
}

async function sendOTPEmail(email, otp) {
  // 5-minute expiry time text
  const expiryTime = new Date(Date.now() + 5 * 60000).toLocaleTimeString();

  if (isDev) {
    // Dev: don't send real email, just log OTP
    console.log(`📧 [DEV MODE] OTP for ${email}: ${otp} (expires at ${expiryTime})`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Footwear" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Footwear - Your OTP Code",
      html: `
        <p>Thank you for signing up!</p>
        <p>Your OTP code is: <strong>${otp}</strong></p>
        <p>Code expires at <strong>${expiryTime}</strong>.</p>
        <p><strong>Security:</strong> Never share this OTP with anyone.</p>
      `,
    });

    console.log("✅ OTP email sent to:", email);
  } catch (err) {
    console.error("❌ Email send failed:", err);
    throw new Error("Failed to send OTP email");
  }
}

async function sendContactEmail(data) {
  const { fname, lname, email, subject, message } = data;
  const adminEmail = "basithkmgm@gmail.com";

  if (isDev) {
    console.log(`📧 [DEV MODE] Contact form message for ${adminEmail}:`);
    console.log(`From: ${fname} ${lname} <${email}>`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Footwear Contact" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      replyTo: email,
      subject: `Contact Form: ${subject}`,
      html: `
        <h3>New Contact Form Message</h3>
        <p><strong>Name:</strong> ${fname} ${lname}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
      `,
    });

    console.log("✅ Contact email sent to admin:", adminEmail);
  } catch (err) {
    console.error("❌ Email send failed:", err);
    throw new Error("Failed to send contact email");
  }
}

module.exports = { sendOTPEmail, sendContactEmail };
