import Message from '../models/Message.js';
import Channel from '../models/Channel.js';
import Workspace from '../models/Workspace.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

// @desc    Get messages for a channel
// @route   GET /api/messages/:channelId
// @access  Private
export const getChannelMessages = async (req, res) => {
    try {
        const { channelId } = req.params;
        const { beforeId } = req.query;
        const userId = req.user._id;

        const channel = await Channel.findById(channelId);
        if (!channel) return res.status(404).json({ message: 'Channel not found' });

        const workspace = await Workspace.findById(channel.workspaceId);
        const isMember = workspace.members.some(
            (m) => (m.user?._id || m.user).toString() === userId.toString()
        );
        if (!isMember) return res.status(403).json({ message: 'Access denied' });

        let query = { channelId };

        if (beforeId) {
            const refMessage = await Message.findById(beforeId);
            if (refMessage) {
                query.createdAt = { $lt: refMessage.createdAt };
            }
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('senderId', 'name username avatar')
            .populate({ path: 'replyTo', populate: { path: 'senderId', select: 'name username avatar' } })
            .populate('readBy.user', 'name username avatar')
            .populate('poll.options.votes', 'name avatar');

        res.json(messages.reverse());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get unread message counts for all channels in a workspace
// @route   GET /api/messages/unread-counts/:workspaceId
// @access  Private
export const getUnreadCounts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const userId = req.user._id;

        // Get all channels in workspace
        const channels = await Channel.find({ workspaceId });

        // For each channel count messages where user is NOT in readBy
        const counts = {};
        await Promise.all(
            channels.map(async (ch) => {
                const count = await Message.countDocuments({
                    channelId: ch._id,
                    'readBy.user': { $ne: userId },
                });
                counts[ch._id.toString()] = count;
            })
        );

        res.json(counts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
export const sendMessage = async (req, res) => {
    try {
        const { channelId, text, mentions, attachments, replyTo } = req.body;
        const userId = req.user._id;

        const channel = await Channel.findById(channelId);
        if (!channel) return res.status(404).json({ message: 'Channel not found' });

        const workspace = await Workspace.findById(channel.workspaceId);
        const isMember = workspace.members.some(
            (m) => (m.user?._id || m.user).toString() === userId.toString()
        );
        if (!isMember) return res.status(403).json({ message: 'Access denied' });

        const message = await Message.create({
            channelId,
            senderId: userId,
            text,
            mentions: mentions || [],
            attachments: attachments || [],
            poll: req.body.poll || undefined,
            replyTo,
            readBy: [{ user: userId, readAt: new Date() }],
        });

        await message.populate([
            { path: 'senderId', select: 'name username avatar' },
            { path: 'replyTo', select: 'text', populate: { path: 'senderId', select: 'name username avatar' } },
            { path: 'readBy.user', select: 'name username avatar' },
        ]);

        // --- Notification Logic ---
        const otherMembers = workspace.members.filter(m => (m.user?._id || m.user).toString() !== userId.toString());

        for (const member of otherMembers) {
            const memberId = (member.user?._id || member.user).toString();
            const memberUser = await User.findById(memberId);
            if (!memberUser) continue;

            const isMuted = memberUser.mutedChannels?.some(chId => chId.toString() === channelId.toString());
            const isMentioned = (mentions || []).some(mId => mId.toString() === memberId);

            if (isMentioned || !isMuted) {
                const notification = await Notification.create({
                    recipient: memberId,
                    sender: userId,
                    workspaceId: channel.workspaceId,
                    type: isMentioned ? 'mention' : 'general',
                    content: isMentioned ? `mentioned you in #${channel.name}` : `new message in #${channel.name}`,
                    link: `/dashboard/chat/${channelId}`,
                    relatedId: message._id
                });

                await notification.populate([
                    { path: 'sender', select: 'name username avatar' },
                    { path: 'workspaceId', select: 'name' }
                ]);

                // Emit real-time notification to the personal room
                const io = req.app.get('io');
                if (io) {
                    io.to(memberId).emit('newNotification', notification);
                }
            }
        }

        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Mark all messages in channel as read — NO DUPLICATES via $addToSet equivalent
// @route   POST /api/messages/:channelId/read
// @access  Private
export const markChannelMessagesAsRead = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user._id;

        const channel = await Channel.findById(channelId);
        if (!channel) return res.status(404).json({ message: 'Channel not found' });

        const workspace = await Workspace.findById(channel.workspaceId);
        const isMember = workspace.members.some(
            (m) => (m.user?._id || m.user).toString() === userId.toString()
        );
        if (!isMember) return res.status(403).json({ message: 'Access denied' });

        const now = new Date();

        // Atomic update — only adds to readBy if user NOT already present
        // This prevents duplicates at the DB level
        const result = await Message.updateMany(
            {
                channelId,
                'readBy.user': { $ne: userId },
            },
            {
                $push: { readBy: { user: userId, readAt: now } },
            }
        );

        // Fetch updated messages for socket broadcast (only those that changed)
        let updatedMessages = [];
        if (result.modifiedCount > 0) {
            updatedMessages = await Message.find({
                channelId,
                'readBy.user': userId,
                updatedAt: { $gte: new Date(now.getTime() - 2000) }, // messages updated in last 2s
            }).populate('readBy.user', 'name avatar');
        }

        res.json({ updatedCount: result.modifiedCount, messages: updatedMessages });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a message
// @route   DELETE /api/messages/:id
// @access  Private
export const deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(id);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        const channel = await Channel.findById(message.channelId);
        const workspace = await Workspace.findById(channel.workspaceId);

        const isSender = message.senderId.toString() === userId.toString();
        const member = workspace.members.find(m => m.user.toString() === userId.toString());
        const isAdmin = member && (member.role === 'owner' || member.role === 'admin');

        if (!isSender && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to delete this message' });
        }

        await message.deleteOne();
        res.json({ message: 'Message removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Vote on a poll in a message
// @route   POST /api/messages/:messageId/vote
// @access  Private
export const voteOnPoll = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { optionId } = req.body;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message || !message.poll) return res.status(404).json({ message: 'Poll not found' });

        // Remove the user's explicit vote from all options so they can only vote once
        message.poll.options.forEach(opt => {
            opt.votes = opt.votes.filter(id => id.toString() !== userId.toString());
        });

        // Add vote to the new target
        const targetOption = message.poll.options.id(optionId);
        if (targetOption) {
            targetOption.votes.push(userId);
        }

        await message.save();

        await message.populate([
            { path: 'senderId', select: 'name username avatar' },
            { path: 'poll.options.votes', select: 'name avatar' }
        ]);

        res.json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
