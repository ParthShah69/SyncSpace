import express from 'express';
import {
    createWorkspace,
    getUserWorkspaces,
    joinWorkspace,
    getWorkspaceById,
    removeMember,
} from '../controllers/workspaceController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
    .post(protect, createWorkspace)
    .get(protect, getUserWorkspaces);

router.post('/join/:inviteLink', protect, joinWorkspace);
router.get('/:id', protect, getWorkspaceById);
router.delete('/:id/members/:memberId', protect, removeMember);

export default router;
