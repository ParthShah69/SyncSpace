import mongoose from 'mongoose';
import crypto from 'crypto';

const algorithm = 'aes-256-cbc';

function encryptText(text) {
    if (!text || !process.env.ENCRYPTION_KEY) return text;
    try {
        const iv = crypto.randomBytes(16);
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (err) {
        console.error('Encryption error:', err);
        return text;
    }
}

function decryptText(text) {
    if (!text || !process.env.ENCRYPTION_KEY) return text;
    const parts = text.split(':');
    if (parts.length !== 2) return text; // likely unencrypted legacy message

    try {
        const iv = Buffer.from(parts[0], 'hex');
        if (iv.length !== 16) return text;
        const encryptedText = Buffer.from(parts[1], 'hex');
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        // If decryption fails, it might be a normal message that just happens to have a colon
        return text;
    }
}

const messageSchema = mongoose.Schema(
    {
        channelId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Channel',
            required: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        text: {
            type: String,
            required: true,
            get: decryptText,
            set: encryptText,
        },
        mentions: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        attachments: [
            {
                url: String,
                fileType: String,
                name: String,
                size: Number,
            },
        ],
        poll: {
            question: String,
            options: [
                {
                    text: String,
                    votes: [
                        {
                            type: mongoose.Schema.Types.ObjectId,
                            ref: 'User',
                        },
                    ],
                },
            ],
        },
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
        },
        edited: {
            type: Boolean,
            default: false,
        },
        readBy: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                readAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
    },
    {
        timestamps: true,
        toJSON: { getters: true },
        toObject: { getters: true },
    }
);

const Message = mongoose.model('Message', messageSchema);

export default Message;
