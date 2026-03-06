import express from 'express';
import { getWorkspaceNotes, getNoteById, createNote, updateNote, deleteNote } from '../controllers/noteController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/workspace/:workspaceId', protect, getWorkspaceNotes);
router.post('/', protect, createNote);
router.route('/:id')
    .get(protect, getNoteById)
    .put(protect, updateNote)
    .delete(protect, deleteNote);

export default router;
