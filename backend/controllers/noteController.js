import Note from '../models/Note.js';

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
        const { workspaceId, title, content, createdFromMessageId } = req.body;
        const userId = req.user._id;

        const note = await Note.create({
            workspaceId,
            title,
            content,
            lastEditedBy: userId,
            createdFromMessageId
        });

        res.status(201).json(note);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content } = req.body;
        const userId = req.user._id;

        const note = await Note.findByIdAndUpdate(
            id,
            { title, content, lastEditedBy: userId },
            { new: true }
        );

        res.json(note);
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
