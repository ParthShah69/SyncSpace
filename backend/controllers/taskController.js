import Task from '../models/Task.js';
import Workspace from '../models/Workspace.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

export const getWorkspaceTasks = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const tasks = await Task.find({ workspaceId })
            .populate('assignedTo', 'name avatar')
            .populate('creator', 'name avatar')
            .populate('taggedMembers', 'name avatar');
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const canEditTask = async (task, userId) => {
    // If no tagged members exist, it's a public task and anyone can edit
    if (!task.taggedMembers || task.taggedMembers.length === 0) return true;

    if (task.creator.toString() === userId.toString()) return true;
    if (task.taggedMembers.some(id => (id._id || id).toString() === userId.toString())) return true;

    const workspace = await Workspace.findById(task.workspaceId);
    if (!workspace) return false;

    const member = workspace.members.find(m => (m.user?._id || m.user).toString() === userId.toString());
    if (member && (member.role === 'owner' || member.role === 'admin')) return true;

    return false;
};

export const createTask = async (req, res) => {
    try {
        const { workspaceId, title, description, assignedTo, status, priority, dueDate, deadline, createdFromMessageId, taggedMembers } = req.body;
        const userId = req.user._id;

        const isSelfAssignedOnly = taggedMembers && taggedMembers.length === 1 && taggedMembers[0].toString() === userId.toString();
        const needsAcceptance = taggedMembers && taggedMembers.length > 0 && !isSelfAssignedOnly;

        const task = await Task.create({
            workspaceId,
            title,
            description,
            assignedTo,
            status,
            priority,
            dueDate,
            deadline,
            createdFromMessageId,
            creator: userId,
            taggedMembers: taggedMembers || [],
            acceptanceStatus: needsAcceptance ? 'pending' : 'accepted'
        });

        // --- Notification Logic ---
        if (taggedMembers && taggedMembers.length > 0) {
            const io = req.app.get('io');
            for (const memberId of taggedMembers) {
                const notification = await Notification.create({
                    recipient: memberId,
                    sender: userId,
                    workspaceId,
                    type: 'task_assignment',
                    content: `assigned you a new task: ${title}`,
                    link: `/dashboard/tasks`,
                    relatedId: task._id
                });

                await notification.populate([
                    { path: 'sender', select: 'name username avatar' },
                    { path: 'workspaceId', select: 'name' }
                ]);

                if (io) {
                    io.to(memberId).emit('newNotification', notification);
                }
            }
        }

        await task.populate([
            { path: 'assignedTo', select: 'name avatar' },
            { path: 'creator', select: 'name avatar' },
            { path: 'taggedMembers', select: 'name avatar' }
        ]);

        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user._id;

        const task = await Task.findById(id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const isAllowed = await canEditTask(task, userId);
        if (!isAllowed) return res.status(403).json({ message: 'Not authorized to edit this task' });

        task.status = status;
        await task.save();
        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, status, priority, dueDate, deadline, acceptanceStatus, taggedMembers } = req.body;
        const userId = req.user._id;

        const task = await Task.findById(id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const isAllowed = await canEditTask(task, userId);
        if (!isAllowed) return res.status(403).json({ message: 'Not authorized to edit this task' });

        if (title !== undefined) task.title = title;
        if (description !== undefined) task.description = description;
        if (status !== undefined) task.status = status;
        if (priority !== undefined) task.priority = priority;
        if (dueDate !== undefined) task.dueDate = dueDate;
        if (deadline !== undefined) task.deadline = deadline;
        if (acceptanceStatus !== undefined) task.acceptanceStatus = acceptanceStatus;

        if (taggedMembers !== undefined) {
            // Only creator or admin can change tags
            const workspace = await Workspace.findById(task.workspaceId);
            const member = workspace?.members.find(m => (m.user?._id || m.user).toString() === userId.toString());
            const isAdmin = member && (member.role === 'owner' || member.role === 'admin');
            const isCreator = task.creator.toString() === userId.toString();

            if (isCreator || isAdmin) {
                task.taggedMembers = taggedMembers;
            }
        }

        await task.save();
        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const reorderTasks = async (req, res) => {
    try {
        const { tasks } = req.body; // Array of { _id, order }
        const userId = req.user._id;

        // We need to check permissions for at least one task to authorize the drag drop,
        // or check permissions for all tasks being moved. Let's just check the first one
        // as usually we reorder one task at a time (even if it updates multiple orders).
        if (tasks.length > 0) {
            const sampleTask = await Task.findById(tasks[0]._id);
            if (sampleTask && !(await canEditTask(sampleTask, userId))) {
                return res.status(403).json({ message: 'Not authorized to reorder these tasks' });
            }
        }

        // Bulk write for performance
        const bulkOps = tasks.map(t => ({
            updateOne: {
                filter: { _id: t._id },
                update: { order: t.order }
            }
        }));

        await Task.bulkWrite(bulkOps);
        res.json({ message: 'Tasks reordered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const acceptRejectTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'accepted' or 'rejected'
        const userId = req.user._id;

        const task = await Task.findById(id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const isTagged = task.taggedMembers.some(id => (id._id || id).toString() === userId.toString());
        if (!isTagged) return res.status(403).json({ message: 'Only tagged members can accept or reject this task' });

        if (status === 'accepted') {
            if (!task.acceptedBy.some(id => id.toString() === userId.toString())) {
                task.acceptedBy.push(userId);
            }
            // If everyone tagged has accepted, mark task as accepted
            const allAccepted = task.taggedMembers.every(id =>
                task.acceptedBy.some(aid => aid.toString() === id.toString())
            );
            if (allAccepted) task.acceptanceStatus = 'accepted';
        } else if (status === 'rejected') {
            // Remove from taggedMembers
            task.taggedMembers = task.taggedMembers.filter(id => id.toString() !== userId.toString());

            // If no one is left, it's fully rejected
            if (task.taggedMembers.length === 0) {
                task.acceptanceStatus = 'rejected';
            }
        }

        await task.save();

        // --- Notification Logic ---
        const io = req.app.get('io');

        // Notify the creator of the decision
        const notification = await Notification.create({
            recipient: task.creator,
            sender: userId,
            workspaceId: task.workspaceId,
            type: status === 'accepted' ? 'task_accepted' : 'task_rejected',
            content: `${status === 'accepted' ? 'accepted' : 'rejected'} the task: ${task.title}`,
            link: `/dashboard/tasks?highlight=${task._id}`,
            relatedId: task._id
        });

        await notification.populate([
            { path: 'sender', select: 'name username avatar' },
            { path: 'workspaceId', select: 'name' }
        ]);

        if (io) {
            io.to(task.creator.toString()).emit('newNotification', notification);

            // If fully rejected, send a special alert
            if (task.acceptanceStatus === 'rejected') {
                const rejectAlert = await Notification.create({
                    recipient: task.creator,
                    sender: userId,
                    workspaceId: task.workspaceId,
                    type: 'task_rejected',
                    content: `ATTENTION: Everyone has rejected the task "${task.title}". Decided its fate?`,
                    link: `/dashboard/tasks?highlight=${task._id}`,
                    relatedId: task._id
                });
                await rejectAlert.populate([{ path: 'sender', select: 'name avatar' }, { path: 'workspaceId', select: 'name' }]);
                io.to(task.creator.toString()).emit('newNotification', rejectAlert);
            }
        }

        await task.populate([
            { path: 'assignedTo', select: 'name avatar' },
            { path: 'creator', select: 'name avatar' },
            { path: 'taggedMembers', select: 'name avatar' }
        ]);

        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const task = await Task.findById(id);

        if (!task) return res.status(404).json({ message: 'Task not found' });

        const isAllowed = await canEditTask(task, userId);
        if (!isAllowed) return res.status(403).json({ message: 'Not authorized to edit this task' });

        await task.deleteOne();
        res.json({ message: 'Task removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
