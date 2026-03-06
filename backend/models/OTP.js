import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
    },
    otp: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ['registration', 'reset'],
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600, // 10 minutes TTL
    },
});

export default mongoose.model('OTP', otpSchema);
