import { useState, useEffect } from 'react';
import { Plus, GripVertical, CheckCircle2, Clock, Circle, ArrowUp, ArrowDown, X, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import api from '../utils/api';
import { format } from 'date-fns';

export default function TaskBoard({ workspaceId }) {
    const { user } = useAuthStore();
    const { workspaces } = useWorkspaceStore();
    const workspace = workspaces.find((w) => w._id === workspaceId);

    const [tasks, setTasks] = useState([]);
    const [showNewTask, setShowNewTask] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [editingTask, setEditingTask] = useState(null);

    const canEditTask = (task) => {
        if (!task || !user || !workspace) return false;

        // 0. If no tagged members, anyone can edit
        if (!task.taggedMembers || task.taggedMembers.length === 0) return true;

        // 1. Creator
        if ((task.creator?._id || task.creator) === user._id) return true;
        // 2. Tagged
        if (task.taggedMembers?.some(t => (t._id || t) === user._id)) return true;
        // 3. Admin/Owner
        const member = workspace.members.find(m => (m.user?._id || m.user) === user._id);
        if (member && (member.role === 'owner' || member.role === 'admin')) return true;

        return false;
    };

    const columns = [
        { id: 'Todo', title: 'To Do', icon: <Circle size={16} className="text-gray-400" /> },
        { id: 'In Progress', title: 'In Progress', icon: <Clock size={16} className="text-blue-500" /> },
        { id: 'Done', title: 'Done', icon: <CheckCircle2 size={16} className="text-green-500" /> },
    ];

    useEffect(() => {
        if (!workspaceId) return;
        const fetchTasks = async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/tasks/${workspaceId}`);
                setTasks(data);
            } catch (error) {
                console.error("Failed to fetch tasks", error);
            } finally {
                setLoading(false);
            }
        };
        fetchTasks();
    }, [workspaceId]);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;

        try {
            const { data } = await api.post('/tasks', {
                workspaceId,
                title: newTaskTitle,
                status: 'Todo',
            });
            setTasks([...tasks, data]);
            setNewTaskTitle('');
            setShowNewTask(false);
        } catch (error) {
            console.error("Failed to create task", error);
        }
    };

    const handleStatusChange = async (taskId, newStatus) => {
        setTasks(tasks.map(t => t._id === taskId ? { ...t, status: newStatus } : t));
        try {
            await api.put(`/tasks/${taskId}/status`, { status: newStatus });
        } catch (error) {
            console.error("Failed to update status", error);
        }
    };

    const handleUpdateTask = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.put(`/tasks/${editingTask._id}`, editingTask);
            setTasks(tasks.map(t => t._id === data._id ? data : t));
            setEditingTask(null);
        } catch (error) {
            console.error("Failed to update task", error);
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!confirm('Are you sure you want to delete this task?')) return;
        try {
            await api.delete(`/tasks/${taskId}`);
            setTasks(tasks.filter(t => t._id !== taskId));
        } catch (error) {
            console.error("Failed to delete task", error);
        }
    };

    const moveTask = async (taskToMove, direction) => {
        let columnTasks = tasks.filter(t => t.status === taskToMove.status).sort((a, b) => (a.order || 0) - (b.order || 0));
        const index = columnTasks.findIndex(t => t._id === taskToMove._id);

        if (direction === 'up' && index > 0) {
            [columnTasks[index - 1], columnTasks[index]] = [columnTasks[index], columnTasks[index - 1]];
        } else if (direction === 'down' && index < columnTasks.length - 1) {
            [columnTasks[index], columnTasks[index + 1]] = [columnTasks[index + 1], columnTasks[index]];
        } else {
            return;
        }

        const updates = columnTasks.map((t, idx) => ({ _id: t._id, order: idx }));

        setTasks(prev => prev.map(t => {
            const update = updates.find(u => u._id === t._id);
            return update ? { ...t, order: update.order } : t;
        }));

        try {
            await api.put('/tasks/reorder', { tasks: updates });
        } catch (error) {
            console.error("Failed to reorder tasks", error);
        }
    };

    if (loading) {
        return <div className="flex-1 p-8 flex justify-center text-gray-400 dark:text-gray-500">Loading tasks...</div>;
    }

    return (
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-slate-900 h-full overflow-hidden p-4 md:p-6 gap-6 transition-colors duration-200">

            {/* Header */}
            <div className="flex items-center justify-between z-10">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-100">Task Board</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm">Manage and track your team's progress</p>
                </div>
                <button
                    onClick={() => setShowNewTask(true)}
                    className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                    <Plus size={16} className="md:mr-2" /> <span className="hidden md:inline">New Task</span>
                </button>
            </div>

            {/* New Task Inline Form */}
            {showNewTask && (
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-900/50 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <input
                        type="text"
                        autoFocus
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="What needs to be done?"
                        className="flex-1 bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border-none rounded-lg px-4 py-3 sm:py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateTask(e)}
                    />
                    <div className="flex justify-end gap-2">
                        <button onClick={handleCreateTask} className="px-4 py-2 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 font-medium rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-500/30">Save</button>
                        <button onClick={() => setShowNewTask(false)} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                    </div>
                </div>
            )}

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4 md:px-0 snap-x snap-mandatory">
                <div className="flex gap-6 h-full w-max px-4 md:px-0">
                    {columns.map(column => {
                        const priorityWeight = { 'High': 1, 'Medium': 2, 'Low': 3 };
                        const columnTasks = tasks.filter(t => t.status === column.id).sort((a, b) => {
                            const pA = priorityWeight[a.priority || 'Medium'];
                            const pB = priorityWeight[b.priority || 'Medium'];
                            if (pA !== pB) return pA - pB;
                            return (a.order || 0) - (b.order || 0);
                        });

                        return (
                            <div key={column.id} className="w-[85vw] max-w-xs md:w-80 flex flex-col bg-gray-100/50 dark:bg-slate-800/30 rounded-2xl p-4 border border-gray-200 dark:border-slate-700/50 snap-center shrink-0">

                                {/* Column Header */}
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <h3 className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                        {column.icon} {column.title}
                                    </h3>
                                    <span className="bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-xs font-bold px-2.5 py-1 rounded-full">
                                        {columnTasks.length}
                                    </span>
                                </div>

                                {/* Column Tasks */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 px-1">
                                    {columnTasks.length === 0 ? (
                                        <div className="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl h-24 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs text-center p-4">
                                            No tasks in this list
                                        </div>
                                    ) : (
                                        columnTasks.map((task, idx) => (
                                            <div
                                                key={task._id}
                                                onClick={() => {
                                                    if (canEditTask(task)) setEditingTask(task);
                                                    else alert('You do not have permission to edit this task.');
                                                }}
                                                className={`bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-all ${canEditTask(task) ? 'group hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-500/50 cursor-pointer' : 'opacity-80'}`}
                                            >
                                                <div className="flex justify-between items-start mb-2 gap-2">
                                                    <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm leading-tight break-words flex-1">{task.title}</h4>
                                                    {canEditTask(task) && (
                                                        <div className="flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                                                            <button disabled={idx === 0} onClick={() => moveTask(task, 'up')} className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUp size={14} /></button>
                                                            <button disabled={idx === columnTasks.length - 1} onClick={() => moveTask(task, 'down')} className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"><ArrowDown size={14} /></button>
                                                        </div>
                                                    )}
                                                </div>

                                                {task.description && (
                                                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">{task.description}</p>
                                                )}

                                                <div className="flex items-center justify-between mt-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide
                              ${task.priority === 'High' ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                                                                task.priority === 'Medium' ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                                    'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}
                                                        >
                                                            {task.priority || 'Medium'}
                                                        </span>
                                                    </div>

                                                    {/* Quick Actions Dropdown */}
                                                    {canEditTask(task) && (
                                                        <div className="flex flex-wrap gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-gray-50 dark:bg-slate-700/50 rounded-lg p-1" onClick={(e) => e.stopPropagation()}>
                                                            {column.id !== 'Todo' && (
                                                                <button onClick={() => handleStatusChange(task._id, 'Todo')} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded text-gray-500 dark:text-gray-400 shadow-sm" title="Move to Todo">
                                                                    <Circle size={12} />
                                                                </button>
                                                            )}
                                                            {column.id !== 'In Progress' && (
                                                                <button onClick={() => handleStatusChange(task._id, 'In Progress')} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded text-blue-500 dark:text-blue-400 shadow-sm" title="Move to In Progress">
                                                                    <Clock size={12} />
                                                                </button>
                                                            )}
                                                            {column.id !== 'Done' && (
                                                                <button onClick={() => handleStatusChange(task._id, 'Done')} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded text-green-500 dark:text-green-400 shadow-sm" title="Move to Done">
                                                                    <CheckCircle2 size={12} />
                                                                </button>
                                                            )}
                                                            <button onClick={() => handleDeleteTask(task._id)} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded text-red-500 shadow-sm" title="Delete Task">
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Edit Task Modal */}
            {editingTask && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setEditingTask(null)}>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Edit Task</h3>
                            <button onClick={() => setEditingTask(null)} className="text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 p-2 rounded-lg transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateTask} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                                <input
                                    type="text"
                                    value={editingTask.title}
                                    onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                                    <select
                                        value={editingTask.status}
                                        onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                                    >
                                        <option value="Todo">To Do</option>
                                        <option value="In Progress">In Progress</option>
                                        <option value="Done">Done</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                                    <select
                                        value={editingTask.priority || 'Medium'}
                                        onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tag Members</label>
                                <div className="flex flex-wrap gap-2">
                                    {workspace?.members?.map(m => {
                                        const isSelected = editingTask.taggedMembers?.some(t => (t._id || t) === (m.user?._id || m.user));
                                        const myRole = workspace.members.find(mx => (mx.user?._id || mx.user) === user._id)?.role;
                                        const isAdmin = myRole === 'owner' || myRole === 'admin';
                                        const isCreator = (editingTask.creator?._id || editingTask.creator) === user._id;
                                        const isTagged = editingTask.taggedMembers?.some(t => (t._id || t) === user._id);
                                        const isNoTags = !editingTask.taggedMembers || editingTask.taggedMembers.length === 0;
                                        const canEditTags = isAdmin || isCreator || isTagged || isNoTags;

                                        return (
                                            <div
                                                key={m.user?._id || m.user}
                                                onClick={() => {
                                                    if (!canEditTags) return;
                                                    const current = editingTask.taggedMembers || [];
                                                    const userId = m.user?._id || m.user;
                                                    if (isSelected) setEditingTask({ ...editingTask, taggedMembers: current.filter(t => (t._id || t) !== userId) });
                                                    else setEditingTask({ ...editingTask, taggedMembers: [...current, userId] });
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${!canEditTags ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${isSelected ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-inner' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                                            >
                                                {m.user?.name || 'Unknown'}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remarks / Details</label>
                                <textarea
                                    value={editingTask.description || ''}
                                    onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                                    rows={4}
                                    placeholder="Add specifics on what needs to be done..."
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar resize-none"
                                />
                            </div>
                            <div className="flex justify-end pt-2">
                                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl shadow-md font-medium hover:bg-indigo-700">
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
