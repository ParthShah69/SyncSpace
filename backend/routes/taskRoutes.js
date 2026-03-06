import express from 'express';
import { getWorkspaceTasks, createTask, updateTaskStatus, updateTask, reorderTasks, deleteTask } from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/:workspaceId', protect, getWorkspaceTasks);
router.post('/', protect, createTask);
router.put('/reorder', protect, reorderTasks);
router.put('/:id/status', protect, updateTaskStatus);
router.route('/:id')
    .put(protect, updateTask)
    .delete(protect, deleteTask);

export default router;
