const nodemailer = require('nodemailer');

// Create email transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false, // true for port 465, false for 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// Send OTP email
const sendOTPEmail = async (email, otp) => {
    try {
        const expiryTime = new Date(Date.now() + 5 * 60000).toLocaleTimeString();

        await transporter.sendMail({
            from: `"Footwear" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Footwear - Your OTP Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; text-align: center; margin-bottom: 20px;">Footwear</h2>
                        <p style="color: #666; font-size: 14px; line-height: 1.6;">
                            Thank you for signing up! Use the OTP code below to verify your email:
                        </p>
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                            <p style="color: white; font-size: 32px; font-weight: bold; letter-spacing: 4px; margin: 0;">${otp}</p>
                        </div>
                        <p style="color: #999; font-size: 12px; text-align: center;">Code expires at ${expiryTime}</p>
                        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; border-radius: 4px;">
                            <p style="color: #856404; font-size: 12px; margin: 0;">
                                <strong>Security:</strong> Never share this OTP with anyone.
                            </p>
                        </div>
                        <p style="color: #999; font-size: 11px; text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                            © 2026 Footwear. This is an automated message.
                        </p>
                    </div>
                </div>
            `,
        });

        console.log('✅ OTP sent to:', email);
    } catch (error) {
        console.error('❌ Email send failed:', error);
        throw new Error('Failed to send OTP email');
    }
};

module.exports = { sendOTPEmail };  // ← FIXED: Export as object
