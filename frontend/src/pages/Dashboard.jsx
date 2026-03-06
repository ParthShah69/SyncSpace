import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { LogOut, Plus, Users, LayoutDashboard, Settings, Hash, HashIcon, Moon, Sun, Menu, X } from 'lucide-react';
import api from '../utils/api';
import { Link, useParams, useNavigate } from 'react-router-dom';
import ChatBoard from '../components/ChatBoard';
import TaskBoard from '../components/TaskBoard';
import NotesBoard from '../components/NotesBoard';
import ErrorBoundary from '../components/ErrorBoundary';

export default function Dashboard() {
    const { user, logout } = useAuthStore();
    const { workspaces, setWorkspaces, currentWorkspace, setCurrentWorkspace, isLoading, setLoading } = useWorkspaceStore();
    const { id: workspaceIdFromUrl } = useParams();
    const navigate = useNavigate();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showWorkspaceSettingsModal, setShowWorkspaceSettingsModal] = useState(false);

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
        fetchWorkspaces();
    }, [setWorkspaces, setCurrentWorkspace, setLoading, workspaceIdFromUrl, navigate]);

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
            <div className={`fixed md:relative w-64 h-full bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-50 border-r border-slate-800 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>

                {/* App Header */}
                <div className="h-16 flex items-center justify-between px-4 font-bold text-xl text-white border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center">
                        <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-lg mr-3 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <LayoutDashboard size={18} className="text-white" />
                        </div>
                        SyncSpace
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Workspace Selector */}
                <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        <span>Your Workspaces</span>
                        <div className="flex space-x-1">
                            <button
                                onClick={() => setShowJoinModal(true)}
                                title="Join Workspace"
                                className="p-1 hover:bg-slate-700 rounded-md transition-colors text-slate-300 hover:text-white"
                            >
                                <HashIcon size={16} />
                            </button>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                title="Create Workspace"
                                className="p-1 hover:bg-slate-700 rounded-md transition-colors text-slate-300 hover:text-white"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {isLoading ? (
                            <div className="text-sm text-slate-500 px-2 py-2 animate-pulse">Loading workspaces...</div>
                        ) : workspaces.length === 0 ? (
                            <div className="text-sm text-slate-500 px-2 py-2">No workspaces yet.</div>
                        ) : (
                            workspaces.map((ws) => (
                                <Link
                                    key={ws._id}
                                    to={`/workspace/${ws._id}`}
                                    onClick={() => setCurrentWorkspace(ws)}
                                    className={`flex items-center w-full px-3 py-2 text-sm rounded-lg transition-all duration-200 group ${currentWorkspace?._id === ws._id
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50'
                                        : 'hover:bg-slate-800 hover:text-slate-100'
                                        }`}
                                >
                                    <div className={`w-6 h-6 rounded flex items-center justify-center mr-3 text-xs font-bold ${currentWorkspace?._id === ws._id ? 'bg-indigo-500' : 'bg-slate-700 group-hover:bg-slate-600'
                                        }`}>
                                        {ws.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="truncate flex-1">{ws.name}</span>
                                </Link>
                            ))
                        )}
                    </div>
                </div>

                {/* User Profile Footer */}
                <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold shadow-md">
                                {user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-3 truncate max-w-[120px]">
                                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
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
                        <div className="h-16 border-b border-gray-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-4 md:px-6 shadow-sm transition-colors duration-200">
                            <div className="flex items-center gap-3 md:gap-6 overflow-x-auto no-scrollbar">
                                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded">
                                    <Menu size={20} />
                                </button>
                                <div className="flex items-center gap-2 pr-4 md:pr-6 border-r border-gray-200 dark:border-slate-700 whitespace-nowrap">
                                    <h1 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100">{currentWorkspace.name}</h1>
                                    <span className="hidden sm:inline-block bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">
                                        {currentWorkspace.members?.length || 1} Members
                                    </span>
                                </div>
                                {/* Navigation Tabs */}
                                <div className="flex space-x-1">
                                    {['chat', 'tasks', 'notes'].map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`px-3 md:px-4 py-2 text-sm font-medium rounded-lg capitalize transition-colors ${activeTab === tab
                                                ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-400'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-slate-800'
                                                }`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 md:space-x-3 ml-2">
                                <button onClick={toggleDarkMode} className="p-2 text-gray-400 hover:text-indigo-500 dark:text-gray-400 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                                </button>
                                <button onClick={() => setShowInviteModal(true)} className="hidden sm:flex items-center text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                                    <Users size={16} className="mr-2" />
                                    Invite
                                </button>
                                <button onClick={() => setShowWorkspaceSettingsModal(true)} className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Workspace Settings">
                                    <Settings size={20} />
                                </button>
                                <button onClick={() => setShowAccountModal(true)} className="p-2 ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title="My Account">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold shadow-md">
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
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-6 border-b border-gray-100 dark:border-slate-700">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">Create New Workspace</h3>
                        </div>
                        <form onSubmit={handleCreateWorkspace} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Workspace Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newWorkspaceName}
                                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                                    placeholder="e.g. Acme Corp, Engineering Team"
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all dark:text-white"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-colors"
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
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowJoinModal(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">Join Workspace</h3>
                        </div>
                        <form onSubmit={handleJoinWorkspace} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Invite Code</label>
                                <input
                                    type="text"
                                    required
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value)}
                                    placeholder="Enter your invite code"
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all dark:text-white"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setShowJoinModal(false)} className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-colors">Join</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && currentWorkspace && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowInviteModal(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">Invite Members</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Share this code with your team securely so they can join the workspace.</p>
                            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                                <code className="flex-1 text-indigo-600 font-bold select-all">{currentWorkspace.inviteLink || currentWorkspace._id}</code>
                                <button onClick={() => {
                                    navigator.clipboard.writeText(currentWorkspace.inviteLink || currentWorkspace._id);
                                    alert('Copied to clipboard!');
                                }} className="px-3 py-1 bg-white border border-gray-200 shadow-sm text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium">Copy</button>
                            </div>
                            <div className="flex justify-end pt-4">
                                <button onClick={() => setShowInviteModal(false)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">Done</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Account Settings Modal */}
            {showAccountModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowAccountModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 bg-gray-50 text-center">
                            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30 mb-4 border-4 border-white">
                                {user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">{user?.name}</h3>
                            <p className="text-gray-500 text-sm">{user?.email}</p>
                        </div>
                        <div className="p-4 bg-white">
                            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-5 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-medium transition-colors">
                                <LogOut size={18} /> Sign Out of SyncSpace
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Workspace Settings Modal */}
            {showWorkspaceSettingsModal && currentWorkspace && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowWorkspaceSettingsModal(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                                    {currentWorkspace.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{currentWorkspace.name}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Workspace Settings</p>
                                </div>
                            </div>
                            <button onClick={() => setShowWorkspaceSettingsModal(false)} className="text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 p-2 rounded-xl transition-colors"><X size={20} /></button>
                        </div>

                        <div className="p-6 overflow-y-auto hide-scrollbar flex-1">
                            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4 tracking-wide uppercase">Members ({currentWorkspace.members?.length || 0})</h4>
                            <div className="space-y-3">
                                {currentWorkspace.members?.map((member) => {
                                    const mUser = member.user || {};
                                    const isMe = String(mUser._id) === String(user._id);
                                    const isOwner = String(currentWorkspace.owner?._id || currentWorkspace.owner) === String(mUser._id);

                                    // Current user logic
                                    const myMemberData = currentWorkspace.members.find(m => String((m.user?._id || m.user)) === String(user._id));
                                    const amIOwnerOrAdmin = myMemberData?.role === 'owner' || myMemberData?.role === 'admin';
                                    const canIRemove = amIOwnerOrAdmin && !isOwner && !isMe;

                                    return (
                                        <div key={mUser._id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50 dark:hover:bg-slate-800/80 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                                                    {mUser.avatar ? <img src={mUser.avatar} className="w-full h-full rounded-full" alt="" /> : mUser.name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{mUser.name} {isMe && <span className="text-[10px] font-normal text-gray-400">(You)</span>}</p>
                                                        {isOwner && <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Owner</span>}
                                                        {!isOwner && member.role === 'admin' && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Admin</span>}
                                                    </div>
                                                    <p className="text-xs text-gray-500 truncate mt-0.5">{mUser.email}</p>
                                                </div>
                                            </div>

                                            {canIRemove && (
                                                <button
                                                    onClick={() => handleRemoveMember(mUser._id)}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-2"
                                                    title="Remove Member"
                                                >
                                                    <X size={16} />
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
        </div>
    );
}
