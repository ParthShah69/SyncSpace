import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { LogOut, Plus, Users, LayoutDashboard, Settings, Hash, HashIcon, Moon, Sun, Menu, X, Bell } from 'lucide-react';
import api from '../utils/api';
import { socket } from '../socket';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ChatBoard from '../components/ChatBoard';
import TaskBoard from '../components/TaskBoard';
import NotesBoard from '../components/NotesBoard';
import ErrorBoundary from '../components/ErrorBoundary';

export default function Dashboard() {
    const { user, logout } = useAuthStore();
    const { workspaces, setWorkspaces, currentWorkspace, setCurrentWorkspace, isLoading, setLoading } = useWorkspaceStore();
    const { id: workspaceIdFromUrl } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showWorkspaceSettingsModal, setShowWorkspaceSettingsModal] = useState(false);
    const [showNotificationModal, setShowNotificationModal] = useState(false);

    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [activeTab, setActiveTab] = useState('chat');

    // UI States
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Initialize Dark Mode
    useEffect(() => {
        const theme = localStorage.getItem('theme');
        if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            setIsDarkMode(true);
            document.documentElement.classList.add('dark');
        } else {
            setIsDarkMode(false);
            document.documentElement.classList.remove('dark');
        }
    }, []);

    // Sync activeTab with URL search params
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['chat', 'tasks', 'notes'].includes(tab)) {
            setActiveTab(tab);
        } else if (searchParams.get('channel')) {
            setActiveTab('chat');
        }
    }, [searchParams]);

    const toggleDarkMode = () => {
        if (isDarkMode) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            setIsDarkMode(false);
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            setIsDarkMode(true);
        }
    };

    useEffect(() => {
        const fetchWorkspaces = async () => {
            setLoading(true);
            try {
                const { data } = await api.get('/workspaces');
                setWorkspaces(data);

                if (data.length > 0) {
                    if (workspaceIdFromUrl) {
                        const found = data.find(w => w._id === workspaceIdFromUrl);
                        setCurrentWorkspace(found || data[0]);
                    } else {
                        setCurrentWorkspace(data[0]);
                        navigate(`/workspace/${data[0]._id}`);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch workspaces", error);
            } finally {
                setLoading(false);
            }
        };

        const fetchNotifications = async () => {
            try {
                const { data } = await api.get('/notifications');
                setNotifications(data);
                setUnreadCount(data.filter(n => !n.isRead).length);
            } catch (error) {
                console.error("Failed to fetch notifications", error);
            }
        };

        fetchWorkspaces();
        fetchNotifications();
    }, [setWorkspaces, setCurrentWorkspace, setLoading, workspaceIdFromUrl, navigate]);

    // Socket: Real-time Notifications
    useEffect(() => {
        if (!user?._id) return;

        socket.emit('joinUser', user._id);

        const handleNewNotification = (notification) => {
            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);

            // Optional: Browser notification
            if (Notification.permission === 'granted') {
                new window.Notification('SyncSpace Update', {
                    body: notification.content,
                    icon: '/icon.png'
                });
            }
        };

        socket.on('newNotification', handleNewNotification);

        return () => {
            socket.off('newNotification', handleNewNotification);
        };
    }, [user?._id]);

    // Request browser notification permission
    useEffect(() => {
        if (window.Notification && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const handleCreateWorkspace = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.post('/workspaces', { name: newWorkspaceName });
            setWorkspaces([...workspaces, data]);
            setCurrentWorkspace(data);
            setShowCreateModal(false);
            setNewWorkspaceName('');
            navigate(`/workspace/${data._id}`);
        } catch (error) {
            console.error(error);
        }
    };

    const handleJoinWorkspace = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.post(`/workspaces/join/${joinCode}`);
            setWorkspaces([...workspaces, data]);
            setCurrentWorkspace(data);
            setShowJoinModal(false);
            setJoinCode('');
            navigate(`/workspace/${data._id}`);
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to join workspace');
        }
    };

    const handleLogout = async () => {
        try {
            await api.post('/auth/logout');
            logout();
        } catch (error) {
            console.error(error);
        }
    };

    const handleMarkAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(notifications.map(n => n._id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error(error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(notifications.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error(error);
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!confirm('Are you sure you want to remove this member?')) return;
        try {
            const { data } = await api.delete(`/workspaces/${currentWorkspace._id}/members/${memberId}`);
            setCurrentWorkspace(data);
            setWorkspaces(workspaces.map(w => w._id === data._id ? data : w));
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to remove member');
        }
    };

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-slate-900 overflow-hidden font-sans transition-colors duration-200">

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar - Workspaces & Navigation */}
            <div className={`fixed md:relative w-64 h-full bg-[var(--bg-surface)] text-[var(--text-secondary)] flex flex-col shadow-xl z-50 border-r border-[var(--border-color)] transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>

                {/* App Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border-color)] bg-[var(--bg-surface)] backdrop-blur-sm shadow-sm overflow-hidden">
                    <Link to="/dashboard" className="flex items-center hover:opacity-80 transition-opacity">
                        <img src="/logo.png" className="h-10 w-auto object-contain" alt="SyncSpace Logo" />
                    </Link>
                    <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        <X size={20} />
                    </button>
                </div>

                {/* Workspace Selector */}
                <div className="p-4 flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg-main)]/30">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-disabled)] uppercase tracking-wider mb-3">
                        <span>Your Workspaces</span>
                        <div className="flex space-x-1">
                            <button
                                onClick={() => setShowJoinModal(true)}
                                title="Join Workspace"
                                className="p-1 hover:bg-[var(--bg-main)] rounded-md transition-colors text-[var(--text-secondary)] hover:text-[var(--brand-secondary)]"
                            >
                                <HashIcon size={16} />
                            </button>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                title="Create Workspace"
                                className="p-1 hover:bg-[var(--bg-main)] rounded-md transition-colors text-[var(--text-secondary)] hover:text-[var(--brand-primary)]"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {isLoading ? (
                            <div className="text-sm text-[var(--text-disabled)] px-2 py-2 animate-pulse">Loading workspaces...</div>
                        ) : workspaces.length === 0 ? (
                            <div className="text-sm text-[var(--text-disabled)] px-2 py-2">No workspaces yet.</div>
                        ) : (
                            workspaces.map((ws) => (
                                <Link
                                    key={ws._id}
                                    to={`/workspace/${ws._id}`}
                                    onClick={() => setCurrentWorkspace(ws)}
                                    className={`flex items-center w-full px-3 py-2 text-sm rounded-xl transition-all duration-200 group ${currentWorkspace?._id === ws._id
                                        ? 'bg-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20'
                                        : 'hover:bg-[var(--bg-main)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center mr-3 text-xs font-black ${currentWorkspace?._id === ws._id ? 'bg-white/20' : 'bg-[var(--bg-main)] group-hover:bg-[var(--border-color)]'
                                        }`}>
                                        {ws.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="truncate flex-1 font-medium">{ws.name}</span>
                                </Link>
                            ))
                        )}
                    </div>
                </div>

                {/* User Profile Footer */}
                <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-surface)]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0">
                            <div className="w-10 h-10 rounded-full brand-gradient-bg flex items-center justify-center text-white font-black shadow-md shrink-0">
                                {user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-3 truncate">
                                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{user?.name}</p>
                                <p className="text-[10px] text-[var(--text-secondary)] truncate uppercase tracking-tighter">{user?.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="p-2 text-[var(--text-disabled)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                            title="Logout"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 relative transition-colors duration-200">
                {currentWorkspace ? (
                    <>
                        {/* Main Header */}
                        <div className="h-16 border-b border-[var(--border-color)] bg-[var(--bg-surface)] backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-4 md:px-6 transition-colors duration-200">
                            <div className="flex items-center gap-3 md:gap-6 overflow-x-auto no-scrollbar">
                                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-main)] rounded-lg transition-colors">
                                    <Menu size={20} />
                                </button>
                                <div className="flex items-center gap-2 pr-4 md:pr-6 border-r border-[var(--border-color)] whitespace-nowrap">
                                    <h1 className="text-lg md:text-xl font-black text-[var(--text-primary)] tracking-tight">{currentWorkspace.name}</h1>
                                    <span className="hidden sm:inline-block bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] text-[10px] uppercase font-black px-2 py-0.5 rounded-full">
                                        {currentWorkspace.members?.length || 1} Members
                                    </span>
                                </div>
                                {/* Navigation Tabs */}
                                <div className="flex p-1 bg-[var(--bg-main)] rounded-xl space-x-1">
                                    {['chat', 'tasks', 'notes'].map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`px-4 py-1.5 text-xs font-black rounded-lg capitalize transition-all duration-300 ${activeTab === tab
                                                ? 'brand-gradient-bg text-white shadow-md'
                                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                                }`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 ml-2">
                                <button
                                    onClick={() => setShowNotificationModal(true)}
                                    className="p-2 text-[var(--text-secondary)] hover:text-[var(--brand-primary)] hover:bg-[var(--bg-main)] rounded-xl transition-all relative"
                                >
                                    <Bell size={20} />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-[var(--bg-surface)] animate-bounce">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </button>
                                <button onClick={toggleDarkMode} className="p-2 text-[var(--text-secondary)] hover:text-[var(--brand-primary)] hover:bg-[var(--bg-main)] rounded-xl transition-all">
                                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                                </button>
                                <button onClick={() => setShowInviteModal(true)} className="hidden sm:flex items-center text-xs font-black text-white brand-gradient-bg px-4 py-2 rounded-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-[var(--brand-primary)]/20">
                                    <Users size={16} className="mr-2" />
                                    Invite
                                </button>
                                <button onClick={() => setShowWorkspaceSettingsModal(true)} className="p-2 text-[var(--text-secondary)] hover:text-[var(--brand-primary)] hover:bg-[var(--bg-main)] rounded-xl transition-all" title="Workspace Settings">
                                    <Settings size={20} />
                                </button>
                                <button onClick={() => setShowAccountModal(true)} className="p-0.5 ml-1 rounded-full border-2 border-[var(--brand-secondary)] hover:border-[var(--brand-primary)] transition-all transform hover:rotate-6" title="My Account">
                                    <div className="w-8 h-8 rounded-full brand-gradient-bg flex items-center justify-center text-white text-[10px] font-black">
                                        {user?.name?.charAt(0).toUpperCase()}
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Workspace View - Dynamic Component */}
                        <div className="flex-1 overflow-hidden">
                            {activeTab === 'chat' && (
                                <ErrorBoundary>
                                    <ChatBoard workspaceId={currentWorkspace._id} />
                                </ErrorBoundary>
                            )}
                            {activeTab === 'tasks' && <TaskBoard workspaceId={currentWorkspace._id} />}
                            {activeTab === 'notes' && <NotesBoard workspaceId={currentWorkspace._id} />}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 relative overflow-hidden">

                        {/* Mobile Sidebar Toggle (Empty State) */}
                        <div className="absolute top-4 left-4 md:hidden z-20">
                            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                <Menu size={24} />
                            </button>
                        </div>

                        <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-xl border border-gray-100 relative z-10 transition-all">
                            <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <LayoutDashboard size={40} className="text-indigo-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-3">No Workspace Selected</h2>
                            <p className="text-gray-500 mb-8 leading-relaxed">
                                You don't have any workspaces yet. Create your first workspace to start collaborating with your team!
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium py-3 px-6 rounded-xl shadow-md transition-all transform hover:-translate-y-0.5"
                                >
                                    Create Workspace
                                </button>
                                <button
                                    onClick={() => setShowJoinModal(true)}
                                    className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-3 px-6 rounded-xl shadow-sm transition-all transform hover:-translate-y-0.5"
                                >
                                    Join Workspace
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Workspace Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-[var(--bg-surface)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-400 border border-[var(--border-color)]">
                        <div className="p-8 border-b border-[var(--border-color)]">
                            <h3 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Create Workspace</h3>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">Start a new space for your team</p>
                        </div>
                        <form onSubmit={handleCreateWorkspace} className="p-8 space-y-6">
                            <div>
                                <label className="block text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-2 ml-1">Workspace Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newWorkspaceName}
                                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                                    placeholder="e.g. Acme Corp, Engineering"
                                    className="w-full px-5 py-4 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent outline-none transition-all text-[var(--text-primary)] font-medium"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-6 py-3 text-sm font-black text-[var(--text-secondary)] bg-[var(--bg-main)] rounded-2xl hover:bg-[var(--border-color)] transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-8 py-3 text-sm font-black text-white brand-gradient-bg rounded-2xl shadow-lg shadow-[var(--brand-primary)]/25 transform hover:scale-105 active:scale-95 transition-all"
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Join Workspace Modal */}
            {showJoinModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowJoinModal(false)}>
                    <div className="bg-[var(--bg-surface)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-400 border border-[var(--border-color)]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-8 border-b border-[var(--border-color)]">
                            <h3 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Join Workspace</h3>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">Enter an invite code to join a team</p>
                        </div>
                        <form onSubmit={handleJoinWorkspace} className="p-8 space-y-6">
                            <div>
                                <label className="block text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-2 ml-1">Invite Code</label>
                                <input
                                    type="text"
                                    required
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value)}
                                    placeholder="Paste code here..."
                                    className="w-full px-5 py-4 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-[var(--brand-secondary)] focus:border-transparent outline-none transition-all text-[var(--text-primary)] font-medium"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setShowJoinModal(false)} className="px-6 py-3 text-sm font-black text-[var(--text-secondary)] bg-[var(--bg-main)] rounded-2xl hover:bg-[var(--border-color)] transition-all">Cancel</button>
                                <button type="submit" className="px-8 py-3 text-sm font-black text-white bg-[var(--brand-secondary)] rounded-2xl shadow-lg shadow-[var(--brand-secondary)]/25 transform hover:scale-105 active:scale-95 transition-all">Join</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && currentWorkspace && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowInviteModal(false)}>
                    <div className="bg-[var(--bg-surface)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-400 border border-[var(--border-color)]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-8 border-b border-[var(--border-color)]">
                            <h3 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Invite Team</h3>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">Share this code with your teammates</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="flex items-center gap-3 p-5 bg-[var(--bg-main)] rounded-2xl border-2 border-dashed border-[var(--border-color)]">
                                <code className="flex-1 text-[var(--brand-primary)] font-black text-lg tracking-widest select-all">{currentWorkspace.inviteLink || currentWorkspace._id}</code>
                                <button onClick={() => {
                                    navigator.clipboard.writeText(currentWorkspace.inviteLink || currentWorkspace._id);
                                    alert('Copied to clipboard!');
                                }} className="px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-xl hover:bg-[var(--bg-main)] text-xs font-black transition-all">COPY</button>
                            </div>
                            <div className="flex justify-end">
                                <button onClick={() => setShowInviteModal(false)} className="px-8 py-3 brand-gradient-bg text-white rounded-2xl font-black text-sm shadow-xl shadow-[var(--brand-primary)]/20 transform hover:scale-105 transition-all">Done</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Account Settings Modal */}
            {showAccountModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowAccountModal(false)}>
                    <div className="bg-[var(--bg-surface)] rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-400 border border-[var(--border-color)]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-10 border-b border-[var(--border-color)] bg-[var(--bg-main)]/50 text-center">
                            <div className="w-24 h-24 mx-auto rounded-full brand-gradient-bg flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-[var(--brand-primary)]/30 mb-6 border-4 border-[var(--bg-surface)] transform hover:rotate-6 transition-transform">
                                {user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <h3 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">{user?.name}</h3>
                            <p className="text-[var(--text-secondary)] text-sm font-medium mt-1">{user?.email}</p>
                        </div>
                        <div className="p-6 bg-[var(--bg-surface)]">
                            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-6 py-4 text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-2xl font-black text-sm transition-all transform active:scale-95">
                                <LogOut size={18} /> SIGN OUT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Workspace Settings Modal */}
            {showWorkspaceSettingsModal && currentWorkspace && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowWorkspaceSettingsModal(false)}>
                    <div className="bg-[var(--bg-surface)] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-400 border border-[var(--border-color)]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-8 border-b border-[var(--border-color)] flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl brand-gradient-bg flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-[var(--brand-primary)]/20">
                                    {currentWorkspace.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-[var(--text-primary)] tracking-tight leading-none">{currentWorkspace.name}</h3>
                                    <p className="text-xs text-[var(--text-secondary)] font-black uppercase tracking-widest mt-1">Workspace Settings</p>
                                </div>
                            </div>
                            <button onClick={() => setShowWorkspaceSettingsModal(false)} className="text-[var(--text-secondary)] hover:bg-[var(--bg-main)] p-3 rounded-2xl transition-all"><X size={20} /></button>
                        </div>

                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                            <h4 className="text-xs font-black text-[var(--text-primary)] mb-6 tracking-widest uppercase flex items-center gap-2">
                                <Users size={14} className="text-[var(--brand-secondary)]" />
                                Members — {currentWorkspace.members?.length || 0}
                            </h4>
                            <div className="space-y-4">
                                {currentWorkspace.members?.map((member) => {
                                    const mUser = member.user || {};
                                    const isMe = String(mUser._id) === String(user._id);
                                    const isOwner = String(currentWorkspace.owner?._id || currentWorkspace.owner) === String(mUser._id);

                                    // Current user logic
                                    const myMemberData = currentWorkspace.members.find(m => String((m.user?._id || m.user)) === String(user._id));
                                    const amIOwnerOrAdmin = myMemberData?.role === 'owner' || myMemberData?.role === 'admin';
                                    const canIRemove = amIOwnerOrAdmin && !isOwner && !isMe;

                                    return (
                                        <div key={mUser._id} className="flex items-center justify-between p-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)]/50 hover:bg-[var(--bg-main)] transition-all group shadow-sm hover:shadow-md">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="w-12 h-12 rounded-full brand-gradient-bg flex items-center justify-center text-white font-black text-lg shadow-inner shrink-0 p-0.5">
                                                    {mUser.avatar ? <img src={mUser.avatar} className="w-full h-full rounded-full border-2 border-[var(--bg-surface)]" alt="" /> : <div className="w-full h-full rounded-full flex items-center justify-center bg-[var(--bg-surface)] text-[var(--brand-primary)] text-xl">{mUser.name?.charAt(0)?.toUpperCase()}</div>}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-sm font-black text-[var(--text-primary)] truncate">{mUser.name} {isMe && <span className="text-[10px] font-black text-[var(--brand-secondary)] uppercase ml-1">#YOU</span>}</p>
                                                        {isOwner && <span className="text-[10px] bg-yellow-400 text-black font-black px-2 py-0.5 rounded-lg uppercase tracking-wider shadow-sm">Owner</span>}
                                                        {!isOwner && member.role === 'admin' && <span className="text-[10px] bg-[var(--brand-primary)] text-white font-black px-2 py-0.5 rounded-lg uppercase tracking-wider shadow-sm">Admin</span>}
                                                    </div>
                                                    <p className="text-[10px] font-bold text-[var(--text-secondary)] truncate uppercase tracking-tighter mt-0.5 opacity-70">{mUser.email}</p>
                                                </div>
                                            </div>

                                            {canIRemove && (
                                                <button
                                                    onClick={() => handleRemoveMember(mUser._id)}
                                                    className="p-3 text-[var(--text-disabled)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                                                    title="Remove Member"
                                                >
                                                    <X size={18} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Notification Modal */}
            {showNotificationModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-end animate-in fade-in duration-300" onClick={() => setShowNotificationModal(false)}>
                    <div className="bg-[var(--bg-surface)] w-full max-w-sm h-full shadow-2xl animate-in slide-in-from-right duration-500 border-l border-[var(--border-color)] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-surface)]">
                            <div>
                                <h3 className="text-xl font-black text-[var(--text-primary)] tracking-tight uppercase">Intel Hub</h3>
                                <p className="text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-widest mt-0.5">Mission Critical Alerts</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <button onClick={handleMarkAllAsRead} className="text-[9px] font-black text-[var(--brand-primary)] uppercase tracking-wider hover:opacity-70 transition-opacity">Clear All</button>
                                )}
                                <button onClick={() => setShowNotificationModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-2 rounded-xl hover:bg-[var(--bg-main)] transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                            {notifications.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                                    <Bell size={48} className="mb-4 text-[var(--text-disabled)]" />
                                    <p className="text-xs font-black uppercase tracking-widest">No Active Intelligence</p>
                                </div>
                            ) : (
                                notifications.map(n => (
                                    <div
                                        key={n._id}
                                        onClick={() => {
                                            const targetHighlight = n.relatedId || n.referenceId;
                                            const wsId = n.workspaceId?._id || n.workspaceId || currentWorkspace?._id;

                                            if (n.link) {
                                                navigate(n.link);
                                            } else if (n.type === 'mention' || n.type === 'general') {
                                                if (n.referenceId && wsId) {
                                                    navigate(`/workspace/${wsId}?channel=${n.referenceId}${targetHighlight ? `&highlight=${targetHighlight}` : ''}`);
                                                }
                                            } else if (n.type?.startsWith('task')) {
                                                if (wsId) {
                                                    navigate(`/workspace/${wsId}?tab=tasks${targetHighlight ? `&highlight=${targetHighlight}` : ''}`);
                                                }
                                            } else if (n.type?.startsWith('note')) {
                                                if (wsId) {
                                                    navigate(`/workspace/${wsId}?tab=notes${targetHighlight ? `&highlight=${targetHighlight}` : ''}`);
                                                }
                                            }
                                            setShowNotificationModal(false);
                                            handleMarkAsRead(n._id);
                                        }}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer group ${n.isRead ? 'bg-[var(--bg-main)]/30 border-[var(--border-color)]' : 'bg-[var(--bg-surface)] border-[var(--brand-primary)]/30 shadow-lg shadow-[var(--brand-primary)]/5'}`}
                                    >
                                        <div className="flex gap-4">
                                            <div className="w-10 h-10 rounded-xl brand-gradient-bg flex items-center justify-center text-white font-black shadow-md shrink-0">
                                                {n.sender?.name?.charAt(0) || '?'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className="text-[10px] font-black text-[var(--text-primary)] uppercase tracking-tighter truncate pr-2">{n.sender?.name || 'System'}</p>
                                                    <span className="text-[8px] font-black text-[var(--text-disabled)] uppercase whitespace-nowrap">
                                                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-bold text-[var(--text-secondary)] leading-tight mb-2 group-hover:text-[var(--text-primary)] transition-colors">{n.content}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${n.type === 'mention' ? 'bg-amber-500/10 text-amber-500' :
                                                        n.type === 'task_assignment' ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' :
                                                            n.type === 'task_accepted' ? 'bg-green-500/10 text-green-500' :
                                                                'bg-[var(--bg-main)] text-[var(--text-disabled)]'
                                                        }`}>
                                                        {n.type.replace('_', ' ')}
                                                    </span>
                                                    {n.workspaceId && (
                                                        <span className="text-[7px] font-black text-[var(--text-disabled)] uppercase tracking-widest truncate opacity-60">
                                                            @ {n.workspaceId.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
