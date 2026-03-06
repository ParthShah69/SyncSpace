import Channel from '../models/Channel.js';
import Workspace from '../models/Workspace.js';

// @desc    Create a new channel
// @route   POST /api/channels
// @access  Private
export const createChannel = async (req, res) => {
    try {
        const { workspaceId, name, type } = req.body;
        const userId = req.user._id;

        // Check if user is a member of the workspace
        const workspace = await Workspace.findById(workspaceId);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        const isMember = workspace.members.some(
            (member) => (member.user?._id || member.user).toString() === userId.toString()
        );

        if (!isMember) {
            return res.status(403).json({ message: 'Not authorized to create channels in this workspace' });
        }

        const channel = await Channel.create({
            workspaceId,
            name,
            type: type || 'text',
        });

        res.status(201).json(channel);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all channels for a workspace
// @route   GET /api/channels/:workspaceId
// @access  Private
export const getWorkspaceChannels = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const userId = req.user._id;

        const workspace = await Workspace.findById(workspaceId);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        const isMember = workspace.members.some(
            (member) => (member.user?._id || member.user).toString() === userId.toString()
        );

        if (!isMember) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const channels = await Channel.find({ workspaceId }).sort({ createdAt: 1 });
        res.json(channels);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a channel
// @route   DELETE /api/channels/:id
// @access  Private
export const deleteChannel = async (req, res) => {
    try {
        const { id } = req.params;
        const channel = await Channel.findById(id);

        if (!channel) {
            return res.status(404).json({ message: 'Channel not found' });
        }

        const workspace = await Workspace.findById(channel.workspaceId);
        if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

        const member = workspace.members.find(
            (m) => (m.user?._id || m.user).toString() === req.user._id.toString()
        );

        if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
            return res.status(403).json({ message: 'Only workspace admins/owners can delete channels' });
        }

        const totalChannels = await Channel.countDocuments({ workspaceId: workspace._id });
        if (totalChannels <= 1) {
            return res.status(400).json({ message: 'Cannot delete the last channel in the workspace' });
        }

        await channel.deleteOne();
        res.status(200).json({ message: 'Channel deleted successfully', id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
