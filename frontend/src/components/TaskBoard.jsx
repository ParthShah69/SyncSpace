import { useState, useEffect } from 'react';
import { Plus, GripVertical, CheckCircle2, Clock, Circle, ArrowUp, ArrowDown, X, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import api from '../utils/api';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';

export default function TaskBoard({ workspaceId }) {
    const { user } = useAuthStore();
    const { workspaces } = useWorkspaceStore();
    const workspace = workspaces.find((w) => w._id === workspaceId);

    const [tasks, setTasks] = useState([]);
    const [showNewTask, setShowNewTask] = useState(false);
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        priority: 'Medium',
        deadline: '',
        taggedMembers: []
    });
    const [loading, setLoading] = useState(true);
    const [editingTask, setEditingTask] = useState(null);
    const [activeColumn, setActiveColumn] = useState('Todo');
    const [searchParams] = useSearchParams();
    const highlightId = searchParams.get('highlight');

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
        { id: 'Todo', title: 'To Do', icon: <Circle size={18} className="text-[var(--text-disabled)]" /> },
        { id: 'In Progress', title: 'In Progress', icon: <Clock size={18} className="text-[var(--brand-secondary)]" /> },
        { id: 'Done', title: 'Done', icon: <CheckCircle2 size={18} className="text-[var(--brand-primary)]" /> },
    ];

    useEffect(() => {
        if (!loading && highlightId) {
            const timer = setTimeout(() => {
                const el = document.getElementById(`task-${highlightId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [loading, highlightId]);

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
        if (!newTask.title.trim()) return;

        try {
            const { data } = await api.post('/tasks', {
                workspaceId,
                ...newTask,
                status: 'Todo',
            });
            setTasks([...tasks, data]);
            setNewTask({
                title: '',
                description: '',
                priority: 'Medium',
                deadline: '',
                taggedMembers: []
            });
            setShowNewTask(false);
        } catch (error) {
            console.error("Failed to create task", error);
        }
    };

    const handleAcceptReject = async (taskId, status) => {
        try {
            const { data } = await api.put(`/tasks/${taskId}/accept-reject`, { status });
            setTasks(tasks.map(t => t._id === taskId ? data : t));
        } catch (error) {
            console.error("Failed to update acceptance status", error);
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

    const handleUpdateTask = async (e, manualTask = null) => {
        if (e) e.preventDefault();
        const taskToUpdate = manualTask || editingTask;
        try {
            const { data } = await api.put(`/tasks/${taskToUpdate._id}`, taskToUpdate);
            setTasks(tasks.map(t => t._id === data._id ? { ...data, creator: taskToUpdate.creator, taggedMembers: data.taggedMembers || [] } : t));
            if (!manualTask) setEditingTask(null);
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
        <div className="flex-1 flex flex-col md:flex-row bg-[var(--bg-main)] h-full overflow-hidden transition-all duration-300">

            {/* Main Content Area */}
            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-500 ${showNewTask ? 'md:mr-4' : ''}`}>
                <div className="p-6 md:p-8 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] tracking-tight uppercase">Task Board</h2>
                        <p className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-widest opacity-60">Strategic Workflow Management</p>
                    </div>
                    {!showNewTask && (
                        <button
                            onClick={() => setShowNewTask(true)}
                            className="flex items-center gap-3 px-6 py-3 brand-gradient-bg text-white rounded-2xl shadow-xl shadow-[var(--brand-primary)]/20 hover:scale-105 active:scale-95 transition-all text-[10px] font-black uppercase tracking-widest"
                        >
                            <Plus size={18} /> New Task
                        </button>
                    )}
                </div>

                <div className="px-6 md:hidden mb-4">
                    <div className="flex bg-[var(--bg-surface)] p-1.5 rounded-2xl border border-[var(--border-color)]">
                        {columns.map(col => (
                            <button
                                key={col.id}
                                onClick={() => setActiveColumn(col.id)}
                                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeColumn === col.id ? 'brand-gradient-bg text-white shadow-lg' : 'text-[var(--text-disabled)]'}`}
                            >
                                {col.title}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-x-auto overflow-y-hidden pb-8 px-6 md:px-8 mt-2 custom-scrollbar">
                    <div className="flex gap-4 md:gap-8 h-full min-w-full pb-4 items-stretch">
                        {columns.map(column => {
                            const isVisible = activeColumn === column.id;
                            const priorityWeight = { 'High': 1, 'Medium': 2, 'Low': 3 };
                            const columnTasks = tasks.filter(t => t.status === column.id).sort((a, b) => {
                                const pA = priorityWeight[a.priority || 'Medium'];
                                const pB = priorityWeight[b.priority || 'Medium'];
                                if (pA !== pB) return pA - pB;
                                return (a.order || 0) - (b.order || 0);
                            });

                            return (
                                <div key={column.id} className={`${isVisible ? 'flex' : 'hidden'} md:flex w-full md:w-[350px] flex-col bg-[var(--bg-surface)] rounded-[2.5rem] p-6 border border-[var(--border-color)] shadow-xl shadow-black/5 shrink-0 min-h-0 h-[calc(100vh-250px)] md:h-full`}>
                                    <div className="flex items-center justify-between mb-8 px-2">
                                        <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-3 uppercase tracking-tighter">
                                            <div className={`p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)]`}>{column.icon}</div>
                                            {column.title}
                                        </h3>
                                        <span className="bg-[var(--bg-main)] text-[var(--text-secondary)] text-[10px] font-black px-3 py-1.5 rounded-full border border-[var(--border-color)]">
                                            {columnTasks.length}
                                        </span>
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
                                        {columnTasks.length === 0 ? (
                                            <div className="border-2 border-dashed border-[var(--border-color)] rounded-[2rem] h-32 flex flex-col items-center justify-center text-[var(--text-disabled)] gap-2 p-6 transition-all hover:border-[var(--brand-secondary)]/30 group">
                                                <div className="w-10 h-10 rounded-full bg-[var(--bg-main)] flex items-center justify-center border border-[var(--border-color)] group-hover:scale-110 transition-transform">
                                                    <Plus size={16} className="opacity-40" />
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest">No Tasks</span>
                                            </div>
                                        ) : (
                                            columnTasks.map((task, idx) => {
                                                const isRejected = task.acceptanceStatus === 'rejected';
                                                const isPending = task.acceptanceStatus === 'pending';
                                                const isMyTaggedTask = (task.taggedMembers || []).some(m => (m._id || m).toString() === user._id.toString());
                                                const isMentioned = task.title?.toLowerCase().includes(`@${user?.name?.toLowerCase()}`) ||
                                                    task.title?.toLowerCase().includes(`@${user?.username?.toLowerCase()}`) ||
                                                    task.description?.toLowerCase().includes(`@${user?.name?.toLowerCase()}`) ||
                                                    task.description?.toLowerCase().includes(`@${user?.username?.toLowerCase()}`);

                                                let classes = `bg-[var(--bg-main)] p-5 rounded-3xl border border-[var(--border-color)] group hover:shadow-2xl hover:shadow-[var(--brand-primary)]/10 hover:border-[var(--brand-primary)]/30 transition-all cursor-pointer relative overflow-hidden ${isRejected ? 'opacity-60 border-red-500/30' : ''} ${highlightId === task._id ? 'premium-glow highlight-task-active shadow-2xl' : ''}`;
                                                if (isMyTaggedTask || isMentioned) classes += ' tagged-pulse';

                                                return (
                                                    <div
                                                        key={task._id}
                                                        id={`task-${task._id}`}
                                                        onClick={() => {
                                                            if (canEditTask(task)) setEditingTask(task);
                                                            else alert('You do not have permission to edit this task.');
                                                        }}
                                                        className={classes}
                                                    >
                                                        {/* Status bar */}
                                                        <div className={`absolute top-0 left-0 w-1.5 h-full ${task.priority === 'High' ? 'brand-gradient-bg' :
                                                            task.priority === 'Medium' ? 'bg-[var(--brand-secondary)]' :
                                                                'bg-[var(--text-disabled)]'
                                                            }`} />

                                                        <div className="flex justify-between items-start mb-4 gap-3">
                                                            <h4 className="font-black text-[var(--text-primary)] text-sm tracking-tight leading-snug flex-1">{task.title}</h4>
                                                            <div className="flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all" onClick={(e) => e.stopPropagation()}>
                                                                <div className="flex gap-1 mb-1">
                                                                    <button
                                                                        disabled={task.status === 'Todo'}
                                                                        onClick={() => {
                                                                            const prevStatus = task.status === 'Done' ? 'In Progress' : 'Todo';
                                                                            handleStatusChange(task._id, prevStatus);
                                                                        }}
                                                                        className="p-1 text-[var(--text-disabled)] hover:text-[var(--brand-primary)] hover:bg-[var(--bg-surface)] rounded-lg disabled:opacity-20 transition-all"
                                                                        title="Move Back"
                                                                    >
                                                                        <ArrowLeft size={12} />
                                                                    </button>
                                                                    <button
                                                                        disabled={task.status === 'Done'}
                                                                        onClick={() => {
                                                                            const nextStatus = task.status === 'Todo' ? 'In Progress' : 'Done';
                                                                            handleStatusChange(task._id, nextStatus);
                                                                        }}
                                                                        className="p-1 text-[var(--text-disabled)] hover:text-[var(--brand-secondary)] hover:bg-[var(--bg-surface)] rounded-lg disabled:opacity-20 transition-all"
                                                                        title="Move Forward"
                                                                    >
                                                                        <ArrowRight size={12} />
                                                                    </button>
                                                                </div>
                                                                <button disabled={idx === 0} onClick={() => moveTask(task, 'up')} className="p-1.5 text-[var(--text-disabled)] hover:text-[var(--brand-primary)] hover:bg-[var(--bg-surface)] rounded-lg disabled:opacity-20 transition-all"><ArrowUp size={14} /></button>
                                                                <button disabled={idx === columnTasks.length - 1} onClick={() => moveTask(task, 'down')} className="p-1.5 text-[var(--text-disabled)] hover:text-[var(--brand-secondary)] hover:bg-[var(--bg-surface)] rounded-lg disabled:opacity-20 transition-all"><ArrowDown size={14} /></button>
                                                            </div>
                                                        </div>

                                                        {task.description && (
                                                            <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-relaxed mb-4 line-clamp-3 opacity-80">{task.description}</p>
                                                        )}

                                                        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-2 h-2 rounded-full ${task.priority === 'High' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                                                                    task.priority === 'Medium' ? 'bg-amber-500' :
                                                                        'bg-slate-400'
                                                                    }`} />
                                                                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-disabled)]">
                                                                    {task.priority || 'Medium'}
                                                                </span>
                                                            </div>

                                                            {/* Accept/Reject Actions for Team members */}
                                                            {isPending &&
                                                                task.taggedMembers?.length > 0 &&
                                                                !(task.taggedMembers.length === 1 && (task.taggedMembers[0]._id || task.taggedMembers[0]) === (task.creator?._id || task.creator)) &&
                                                                task.taggedMembers?.some(m => (m._id || m) === user._id) &&
                                                                !task.acceptedBy?.some(id => (id._id || id) === user._id) ? (
                                                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => handleAcceptReject(task._id, 'accepted')}
                                                                        className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-lg shadow-green-500/20"
                                                                    >
                                                                        Accept
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleAcceptReject(task._id, 'rejected')}
                                                                        className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                                                                    >
                                                                        Reject
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-end gap-1">
                                                                    {isPending && task.taggedMembers?.length > 0 && (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[7px] font-black text-[var(--text-disabled)] uppercase tracking-widest">
                                                                                {task.acceptedBy?.length || 0} / {task.taggedMembers?.length + (task.acceptedBy?.length || 0)} Accepted
                                                                            </span>
                                                                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg">Pending</span>
                                                                        </div>
                                                                    )}
                                                                    {isRejected && (
                                                                        <div className="flex flex-col items-end gap-2">
                                                                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg">All Rejected</span>
                                                                            {(task.creator?._id || task.creator) === user._id && (
                                                                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                                                                    <button
                                                                                        onClick={() => handleUpdateTask({ preventDefault: () => { }, target: {} }, { ...task, acceptanceStatus: 'accepted' })}
                                                                                        className="text-[7px] font-black uppercase bg-[var(--bg-surface)] border border-[var(--border-color)] px-2 py-1 rounded-md hover:border-[var(--brand-primary)]"
                                                                                    >Keep</button>
                                                                                    <button
                                                                                        onClick={() => handleDeleteTask(task._id)}
                                                                                        className="text-[7px] font-black uppercase bg-red-500 text-white px-2 py-1 rounded-md hover:bg-red-600"
                                                                                    >Remove</button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            <div className="flex -space-x-1.5 overflow-hidden">
                                                                {task.taggedMembers?.slice(0, 3).map((m, i) => {
                                                                    const memberName = m.name || (workspace?.members.find(wm => (wm.user?._id || wm.user) === (m._id || m))?.user?.name) || 'Specialist';
                                                                    return (
                                                                        <div key={i} title={memberName} className="w-5 h-5 rounded-full border-2 border-[var(--bg-main)] brand-gradient-bg flex items-center justify-center text-[7px] font-black text-white shadow-sm ring-1 ring-black/5">
                                                                            {memberName.charAt(0).toUpperCase()}
                                                                        </div>
                                                                    );
                                                                })}
                                                                {task.taggedMembers?.length > 3 && (
                                                                    <div className="w-5 h-5 rounded-full border-2 border-[var(--bg-main)] bg-[var(--bg-surface)] flex items-center justify-center text-[7px] font-black text-[var(--text-disabled)] shadow-sm">
                                                                        +{task.taggedMembers.length - 3}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {task.deadline && (
                                                            <div className="mt-3 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.1em] text-[var(--brand-secondary)] opacity-80 bg-[var(--bg-surface)] w-fit px-2 py-1 rounded-md border border-[var(--border-color)]">
                                                                <Clock size={10} />
                                                                {format(new Date(task.deadline), 'MMM dd, yyyy')}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Premium New Task Side Panel */}
            {showNewTask && (
                <div className="fixed inset-0 md:relative md:w-[450px] bg-[var(--bg-surface)] md:border-l border-[var(--border-color)] h-full flex flex-col shadow-2xl z-[100] md:z-40 animate-in slide-in-from-right-12 duration-500">
                    <div className="p-8 border-b border-[var(--border-color)] flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl brand-gradient-bg flex items-center justify-center text-white shadow-lg shadow-[var(--brand-primary)]/20">
                                <Plus size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-[var(--text-primary)] tracking-tight uppercase">Draft Task</h3>
                                <p className="text-[10px] font-black text-[var(--brand-primary)] uppercase tracking-widest">{workspace?.name}</p>
                            </div>
                        </div>
                        <button onClick={() => setShowNewTask(false)} className="p-3 bg-[var(--bg-main)] text-[var(--text-disabled)] hover:text-red-500 rounded-2xl border border-[var(--border-color)] transition-all">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] ml-1">Task Identification</label>
                            <input
                                type="text"
                                autoFocus
                                value={newTask.title}
                                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                placeholder="Core objective name..."
                                className="w-full px-6 py-5 bg-[var(--bg-main)] text-[var(--text-primary)] font-black border border-[var(--border-color)] rounded-2xl outline-none focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--brand-primary)]/10 transition-all text-sm placeholder:text-[var(--text-disabled)]/40"
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] ml-1">Strategic Details</label>
                            <textarea
                                value={newTask.description}
                                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                rows={4}
                                placeholder="Elaborate on the requirements and expected outcomes..."
                                className="w-full px-6 py-5 bg-[var(--bg-main)] text-[var(--text-primary)] font-bold border border-[var(--border-color)] rounded-2xl outline-none focus:border-[var(--brand-secondary)] transition-all text-sm placeholder:text-[var(--text-disabled)]/40 resize-none min-h-[120px]"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] ml-1">Priority Level</label>
                                <select
                                    value={newTask.priority}
                                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                                    className="w-full px-6 py-4 bg-[var(--bg-main)] text-[var(--text-primary)] font-black border border-[var(--border-color)] rounded-2xl outline-none appearance-none cursor-pointer hover:border-[var(--brand-primary)] transition-all text-xs"
                                >
                                    <option value="Low">Low Priority</option>
                                    <option value="Medium">Medium Priority</option>
                                    <option value="High">High Priority</option>
                                </select>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] ml-1">Deadline Date</label>
                                <input
                                    type="date"
                                    value={newTask.deadline}
                                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                                    className="w-full px-6 py-4 bg-[var(--bg-main)] text-[var(--text-primary)] font-black border border-[var(--border-color)] rounded-2xl outline-none hover:border-[var(--brand-secondary)] transition-all text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] ml-1">Assign Specialists</label>
                            <div className="flex flex-wrap gap-2.5">
                                {workspace?.members?.map(m => {
                                    const isSelected = newTask.taggedMembers?.includes(m.user?._id || m.user);
                                    return (
                                        <button
                                            key={m.user?._id || m.user}
                                            type="button"
                                            onClick={() => {
                                                const userId = m.user?._id || m.user;
                                                const current = newTask.taggedMembers || [];
                                                if (isSelected) setNewTask({ ...newTask, taggedMembers: current.filter(id => id !== userId) });
                                                else setNewTask({ ...newTask, taggedMembers: [...current, userId] });
                                            }}
                                            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${isSelected ? 'brand-gradient-bg text-white border-transparent shadow-lg shadow-[var(--brand-primary)]/30' : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--brand-secondary)] hover:text-[var(--text-primary)]'}`}
                                        >
                                            {m.user?.name || 'Unknown'}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="pt-8">
                            <button
                                type="submit"
                                disabled={!newTask.title.trim()}
                                className="w-full py-5 brand-gradient-bg text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-[0_20px_40px_rgba(213,0,249,0.2)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:grayscale transition-all"
                            >
                                Dispatch Task
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Edit Task Modal */}
            {editingTask && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300" onClick={() => setEditingTask(null)}>
                    <div className="bg-[var(--bg-surface)] rounded-3xl md:rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-400 border border-[var(--border-color)]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 md:p-8 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-surface)]">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl brand-gradient-bg flex items-center justify-center text-white shadow-lg shadow-[var(--brand-primary)]/20">
                                    <Clock size={24} />
                                </div>
                                <h3 className="text-xl font-black text-[var(--text-primary)] tracking-tight uppercase">Update Strategy</h3>
                            </div>
                            <button onClick={() => setEditingTask(null)} className="text-[var(--text-disabled)] hover:text-[var(--text-primary)] p-2.5 rounded-2xl hover:bg-[var(--bg-main)] transition-all">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateTask} className="p-6 md:p-8 space-y-6 custom-scrollbar max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mb-3 ml-1">Objective Title</label>
                                <input
                                    type="text"
                                    value={editingTask.title}
                                    onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                                    className="w-full px-6 py-4 bg-[var(--bg-main)] text-[var(--text-primary)] font-black border border-[var(--border-color)] rounded-2xl outline-none focus:border-[var(--brand-primary)] transition-all text-sm"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mb-3 ml-1">Workflow Status</label>
                                    <select
                                        value={editingTask.status}
                                        onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}
                                        className="w-full px-6 py-4 bg-[var(--bg-main)] text-[var(--text-primary)] font-black border border-[var(--border-color)] rounded-2xl outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="Todo">To Do</option>
                                        <option value="In Progress">In Progress</option>
                                        <option value="Done">Done</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mb-3 ml-1">Priority Level</label>
                                    <select
                                        value={editingTask.priority || 'Medium'}
                                        onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value })}
                                        className="w-full px-6 py-4 bg-[var(--bg-main)] text-[var(--text-primary)] font-black border border-[var(--border-color)] rounded-2xl outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mb-3 ml-1">Stakeholders Assigned</label>
                                <div className="flex flex-wrap gap-2.5">
                                    {workspace?.members?.map(m => {
                                        const isSelected = editingTask.taggedMembers?.some(t => (t._id || t) === (m.user?._id || m.user));
                                        const myRole = workspace.members.find(mx => (mx.user?._id || mx.user) === user._id)?.role;
                                        const isAdmin = myRole === 'owner' || myRole === 'admin';
                                        const isCreator = (editingTask.creator?._id || editingTask.creator) === user._id;
                                        const isTagged = editingTask.taggedMembers?.some(t => (t._id || t) === user._id);
                                        const isNoTags = !editingTask.taggedMembers || editingTask.taggedMembers.length === 0;
                                        const canEditTags = isAdmin || isCreator || isTagged || isNoTags;

                                        return (
                                            <button
                                                key={m.user?._id || m.user}
                                                type="button"
                                                onClick={() => {
                                                    if (!canEditTags) return;
                                                    const current = editingTask.taggedMembers || [];
                                                    const userId = m.user?._id || m.user;
                                                    if (isSelected) setEditingTask({ ...editingTask, taggedMembers: current.filter(t => (t._id || t) !== userId) });
                                                    else setEditingTask({ ...editingTask, taggedMembers: [...current, userId] });
                                                }}
                                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${!canEditTags ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'brand-gradient-bg text-white border-transparent' : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-secondary)]'}`}
                                            >
                                                {m.user?.name || 'Unknown'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mb-3 ml-1">Deadline Date</label>
                                <input
                                    type="date"
                                    value={editingTask.deadline ? new Date(editingTask.deadline).toISOString().split('T')[0] : ''}
                                    onChange={(e) => setEditingTask({ ...editingTask, deadline: e.target.value })}
                                    className="w-full px-6 py-4 bg-[var(--bg-main)] text-[var(--text-primary)] font-black border border-[var(--border-color)] rounded-2xl outline-none hover:border-[var(--brand-secondary)] transition-all text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mb-3 ml-1">Mission Particulars</label>
                                <textarea
                                    value={editingTask.description || ''}
                                    onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                                    rows={4}
                                    placeholder="Add specifics on what needs to be done..."
                                    className="w-full px-6 py-4 bg-[var(--bg-main)] text-[var(--text-primary)] font-bold border border-[var(--border-color)] rounded-2xl outline-none focus:border-[var(--brand-secondary)] transition-all text-sm resize-none"
                                />
                            </div>
                            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4">
                                <button type="button" onClick={() => handleDeleteTask(editingTask._id)} className="px-6 py-4 bg-red-500/10 text-red-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-500 hover:text-white transition-all">Delete Objective</button>
                                <button type="submit" className="px-10 py-4 brand-gradient-bg text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-[var(--brand-primary)]/20 hover:scale-105 active:scale-95 transition-all">Commit Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
