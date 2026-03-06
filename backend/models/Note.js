import mongoose from 'mongoose';

const noteSchema = mongoose.Schema(
    {
        workspaceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true,
        },
        title: {
            type: String,
            required: true,
            default: 'Untitled Note'
        },
        content: {
            type: String,
            default: ''
        },
        lastEditedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        createdFromMessageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
        }
    },
    {
        timestamps: true,
    }
);

const Note = mongoose.model('Note', noteSchema);

export default Note;
