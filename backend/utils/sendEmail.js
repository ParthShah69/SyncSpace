import nodemailer from 'nodemailer';

const sendEmail = async ({ to, subject, text, html }) => {
    let transporter;

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        // Use real SMTP config if provided
        transporter = nodemailer.createTransport({
            service: 'gmail', // or your preferred service like SendGrid, Mailgun etc
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    } else {
        // Fallback to ethereal email for testing
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user, // generated ethereal user
                pass: testAccount.pass, // generated ethereal password
            },
        });
        console.log(`[Ethereal Email Setup] Test account ready: ${testAccount.user}`);
    }

    const mailOptions = {
        from: process.env.EMAIL_USER || '"SyncSpace Admin" <no-reply@syncspace.com>',
        to,
        subject,
        text,
        html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);

    // If we used Ethereal email, log the preview URL specifically
    if (nodemailer.getTestMessageUrl(info)) {
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }

    return info;
};

export default sendEmail;
