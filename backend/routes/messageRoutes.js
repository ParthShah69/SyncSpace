import express from 'express';
import {
    getChannelMessages,
    sendMessage,
    deleteMessage,
    markChannelMessagesAsRead,
    getUnreadCounts,
    voteOnPoll
} from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, sendMessage);
router.get('/unread-counts/:workspaceId', protect, getUnreadCounts);
router.get('/:channelId', protect, getChannelMessages);
router.post('/:channelId/read', protect, markChannelMessagesAsRead);
router.delete('/:id', protect, deleteMessage);
router.post('/:messageId/vote', protect, voteOnPoll);

export default router;
