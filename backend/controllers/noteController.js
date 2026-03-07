import Note from '../models/Note.js';
import Workspace from '../models/Workspace.js';

export const getWorkspaceNotes = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const notes = await Note.find({ workspaceId }).sort({ updatedAt: -1 });
        res.json(notes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getNoteById = async (req, res) => {
    try {
        const { id } = req.params;
        const note = await Note.findById(id).populate('lastEditedBy', 'name');
        res.json(note);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const createNote = async (req, res) => {
    try {
        const { workspaceId, title, content, createdFromMessageId, checklists, allowedEditors } = req.body;
        const userId = req.user._id;

        const note = await Note.create({
            workspaceId,
            title,
            content,
            lastEditedBy: userId,
            creator: userId,
            createdFromMessageId,
            checklists: checklists || [],
            allowedEditors: allowedEditors || [userId] // Creator is allowed by default
        });

        res.status(201).json(note);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, checklists, allowedEditors } = req.body;
        const userId = req.user._id;

        const note = await Note.findById(id);
        if (!note) return res.status(404).json({ message: 'Note not found' });

        const workspace = await Workspace.findById(note.workspaceId);
        const member = workspace.members.find(m => (m.user?._id || m.user).toString() === userId.toString());
        const isAdmin = member && (member.role === 'owner' || member.role === 'admin');
        const isAllowedByNote = note.allowedEditors?.some(eId => eId.toString() === userId.toString());

        if (!isAdmin && !isAllowedByNote) {
            return res.status(403).json({ message: 'You do not have permission to edit this note' });
        }

        if (title !== undefined) note.title = title;
        if (content !== undefined) note.content = content;
        if (checklists !== undefined) note.checklists = checklists;

        // Fallback for legacy notes: set creator to lastEditedBy if it doesn't exist
        if (!note.creator && note.lastEditedBy) {
            note.creator = note.lastEditedBy;
        }

        const isCreator = note.creator && note.creator.toString() === userId.toString();
        const canManagePermissions = isAdmin || isCreator;

        // Only admins/owners or the ORIGINAL creator can change allowedEditors
        if (allowedEditors !== undefined && canManagePermissions) {
            note.allowedEditors = allowedEditors;
        }

        note.lastEditedBy = userId;
        const updatedNote = await note.save();

        res.json(updatedNote);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteNote = async (req, res) => {
    try {
        const { id } = req.params;
        const note = await Note.findById(id);

        if (!note) return res.status(404).json({ message: 'Note not found' });

        await note.deleteOne();
        res.json({ message: 'Note removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
