import Task from '../models/Task.js';
import Workspace from '../models/Workspace.js';

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
        const { workspaceId, title, description, assignedTo, status, priority, dueDate, createdFromMessageId, taggedMembers } = req.body;
        const userId = req.user._id;

        const task = await Task.create({
            workspaceId,
            title,
            description,
            assignedTo,
            status,
            priority,
            dueDate,
            createdFromMessageId,
            creator: userId,
            taggedMembers: taggedMembers || []
        });

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
        const { title, description, status, priority, dueDate, taggedMembers } = req.body;
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

export const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const task = await Task.findById(id);

        if (!task) return res.status(404).json({ message: 'Task not found' });

        const isAllowed = await canEditTask(task, userId);
        if (!isAllowed) return res.status(403).json({ message: 'Not authorized to delete this task' });

        await task.deleteOne();
        res.json({ message: 'Task removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
