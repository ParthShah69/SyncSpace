import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import crypto from 'crypto';

// @desc    Create a new workspace
// @route   POST /api/workspaces
// @access  Private
export const createWorkspace = async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user._id;

        const inviteLink = crypto.randomBytes(16).toString('hex');

        const workspace = await Workspace.create({
            name,
            description,
            owner: userId,
            members: [{ user: userId, role: 'owner' }],
            inviteLink,
        });

        // Add workspace to user's joinedWorkspaces
        await User.findByIdAndUpdate(userId, {
            $push: { joinedWorkspaces: workspace._id },
        });

        res.status(201).json(workspace);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all user's workspaces
// @route   GET /api/workspaces
// @access  Private
export const getUserWorkspaces = async (req, res) => {
    try {
        const userId = req.user._id;

        const workspaces = await Workspace.find({ 'members.user': userId })
            .populate('members.user', 'name username email avatar');

        res.json(workspaces);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Join workspace via invite link
// @route   POST /api/workspaces/join/:inviteLink
// @access  Private
export const joinWorkspace = async (req, res) => {
    try {
        const { inviteLink } = req.params;
        const userId = req.user._id;

        const workspace = await Workspace.findOne({ inviteLink });

        if (!workspace) {
            return res.status(404).json({ message: 'Invalid invite link' });
        }

        // Check if user is already a member
        const isMember = workspace.members.find(
            (member) => member.user.toString() === userId.toString()
        );

        if (isMember) {
            return res.status(400).json({ message: 'You are already a member of this workspace' });
        }

        workspace.members.push({ user: userId, role: 'member' });
        await workspace.save();

        await User.findByIdAndUpdate(userId, {
            $push: { joinedWorkspaces: workspace._id },
        });

        res.json(workspace);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get workspace details by ID
// @route   GET /api/workspaces/:id
// @access  Private
export const getWorkspaceById = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const userId = req.user._id;

        const workspace = await Workspace.findById(workspaceId)
            .populate('owner', 'name username email avatar')
            .populate('members.user', 'name username email avatar');

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        // Check if the user is a member
        const isMember = workspace.members.some(
            (member) => (member.user?._id || member.user).toString() === userId.toString()
        );

        if (!isMember) {
            return res.status(403).json({ message: 'Access denied' });
        }

        res.json(workspace);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Remove a member from a workspace
// @route   DELETE /api/workspaces/:id/members/:memberId
// @access  Private
export const removeMember = async (req, res) => {
    try {
        const { id, memberId } = req.params;
        const userId = req.user._id;

        const workspace = await Workspace.findById(id);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        const requestingMember = workspace.members.find(
            (m) => (m.user?._id || m.user).toString() === userId.toString()
        );

        if (!requestingMember || (requestingMember.role !== 'owner' && requestingMember.role !== 'admin')) {
            if (userId.toString() !== memberId) {
                return res.status(403).json({ message: 'Not authorized to remove members' });
            }
        } // User can remove themselves (leave workspace)

        if (workspace.owner.toString() === memberId) {
            return res.status(400).json({ message: 'Cannot remove the workspace owner' });
        }

        workspace.members = workspace.members.filter(
            (member) => (member.user?._id || member.user).toString() !== memberId.toString()
        );

        await workspace.save();
        res.json(workspace);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
