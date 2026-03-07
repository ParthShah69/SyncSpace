import mongoose from 'mongoose';

const userSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        avatar: {
            type: String,
            default: '',
        },
        joinedWorkspaces: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Workspace',
            }
        ],
        mutedChannels: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Channel',
            }
        ],
        leftChannels: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Channel',
            }
        ]
    },
    {
        timestamps: true,
    }
);

const User = mongoose.model('User', userSchema);

export default User;
