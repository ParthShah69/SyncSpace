import express from 'express';
import { createChannel, getWorkspaceChannels, deleteChannel } from '../controllers/channelController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createChannel);
router.get('/:workspaceId', protect, getWorkspaceChannels);
router.delete('/:id', protect, deleteChannel);

export default router;
