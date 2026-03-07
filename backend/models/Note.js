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
        creator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        createdFromMessageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
        },
        checklists: [
            {
                text: { type: String, required: true },
                completed: { type: Boolean, default: false }
            }
        ],
        allowedEditors: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        ]
    },
    {
        timestamps: true,
    }
);

const Note = mongoose.model('Note', noteSchema);

export default Note;
