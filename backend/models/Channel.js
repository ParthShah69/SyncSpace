import mongoose from 'mongoose';

const channelSchema = mongoose.Schema(
    {
        workspaceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: ['text', 'voice'],
            default: 'text',
        },
    },
    {
        timestamps: true,
    }
);

const Channel = mongoose.model('Channel', channelSchema);

export default Channel;
