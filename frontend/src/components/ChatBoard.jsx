import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { socket } from '../socket';
import {
    Hash, CornerDownRight, CheckSquare, FileText, Reply, X, Plus,
    Trash2, Check, CheckCheck, AtSign, BarChart2, Paperclip, File, Loader2
} from 'lucide-react';
import api from '../utils/api';
import { format, isToday, isYesterday } from 'date-fns';

// Safe wrapper – never throws RangeError on null / invalid timestamps
const safeDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
};

const safeFormat = (dateStr, fmt, fallback = '') => {
    const d = safeDate(dateStr);
    if (!d) return fallback;
    try { return format(d, fmt); } catch { return fallback; }
};

const getDateLabel = (dateStr) => {
    const d = safeDate(dateStr);
    if (!d) return '';
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMMM d, yyyy');
};


export default function ChatBoard({ workspaceId }) {
    const { user } = useAuthStore();
    const { channels, setChannels, currentChannel, setCurrentChannel, messages, setMessages, addMessage, prependMessages } = useChatStore();
    const { workspaces } = useWorkspaceStore();
    const workspace = workspaces.find((w) => w._id === workspaceId);
    const members = workspace?.members || [];

    const myMemberData = members.find(m => String((m.user?._id || m.user)) === String(user._id));
    const amIOwnerOrAdmin = myMemberData?.role === 'owner' || myMemberData?.role === 'admin';

    const [newMessage, setNewMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [typingUsers, setTypingUsers] = useState([]);
    const [replyingTo, setReplyingTo] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [readReceiptMap, setReadReceiptMap] = useState({});   // msgId -> readBy[]
    const [openReceiptPopover, setOpenReceiptPopover] = useState(null);
    const [unreadCounts, setUnreadCounts] = useState({});       // channelId -> number
    const [firstUnreadId, setFirstUnreadId] = useState(null);   // first unread msg _id
    const [openProfilePopover, setOpenProfilePopover] = useState(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);

    // Mentions state
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionFlyout, setShowMentionFlyout] = useState(false);
    const [mentionIndex, setMentionIndex] = useState(0);
    const inputRef = useRef(null);

    // Poll State
    const [showPollModal, setShowPollModal] = useState(false);
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState(['', '']);

    // File Upload State
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const messagesEndRef = useRef(null);
    const firstUnreadRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const readReceiptMapRef = useRef({});
    const currentChannelRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const prevScrollHeightRef = useRef(null);

    useEffect(() => { currentChannelRef.current = currentChannel; }, [currentChannel]);

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });

    // Auto-scroll on new messages, preserve scroll on prepend
    useEffect(() => {
        if (prevScrollHeightRef.current && scrollContainerRef.current) {
            const newScrollHeight = scrollContainerRef.current.scrollHeight;
            scrollContainerRef.current.scrollTop = newScrollHeight - prevScrollHeightRef.current;
            prevScrollHeightRef.current = null;
        } else {
            scrollToBottom();
        }
    }, [messages, typingUsers, currentChannel]);

    const loadOlderMessages = async () => {
        if (!hasMoreMessages || isLoadingMore || messages.length === 0) return;
        setIsLoadingMore(true);
        try {
            const beforeId = messages[0]._id;
            const { data } = await api.get(`/messages/${currentChannel._id}?beforeId=${beforeId}`);
            if (data.length < 50) setHasMoreMessages(false);
            if (scrollContainerRef.current) {
                prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
            }
            if (data.length > 0) prependMessages(data);
        } catch (err) {
            console.error('Failed to load older messages:', err);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleScroll = (e) => {
        if (e.target.scrollTop === 0) loadOlderMessages();
    };

    // Sync readReceiptMap from loaded messages
    useEffect(() => {
        const map = {};
        messages.forEach((msg) => { if (msg.readBy?.length) map[msg._id] = msg.readBy; });
        setReadReceiptMap(map);
        readReceiptMapRef.current = map;
    }, [messages]);

    // Fetch channels and unread counts on workspace change
    useEffect(() => {
        if (!workspaceId) return;
        const fetchChannels = async () => {
            try {
                const { data } = await api.get(`/channels/${workspaceId}`);
                setChannels(data);
                setCurrentChannel(null);
                setMessages([]);
            } catch (err) { console.error('Failed to fetch channels:', err); }
        };
        const fetchUnreadCounts = async () => {
            try {
                const { data } = await api.get(`/messages/unread-counts/${workspaceId}`);
                setUnreadCounts(data);
            } catch (_) { }
        };
        fetchChannels();
        fetchUnreadCounts();
    }, [workspaceId, setChannels, setCurrentChannel, setMessages]);

    // Mark channel as read (atomic, no duplicates at DB level)
    const markAsRead = useCallback(async (channelId) => {
        if (!channelId) return;
        try {
            const { data } = await api.post(`/messages/${channelId}/read`);
            // Clear local unread count for this channel
            setUnreadCounts((prev) => ({ ...prev, [channelId]: 0 }));
            if (data.updatedCount > 0) {
                const newMap = { ...readReceiptMapRef.current };
                data.messages.forEach((msg) => { newMap[msg._id] = msg.readBy; });
                setReadReceiptMap(newMap);
                readReceiptMapRef.current = newMap;
                socket.emit('markRead', { channelId, updatedMessages: data.messages });
            }
        } catch (_) { }
    }, []);

    // Socket setup on channel change
    useEffect(() => {
        if (!currentChannel) return;
        socket.connect();
        socket.emit('joinChannel', currentChannel._id);

        const fetchMessages = async () => {
            try {
                const { data } = await api.get(`/messages/${currentChannel._id}`);
                // Determine the first unread message before marking read
                const firstUnread = data.find((msg) =>
                    !msg.readBy?.some(r =>
                        (typeof r.user === 'object' ? r.user?._id : r.user)?.toString() === user._id?.toString()
                    )
                );
                setFirstUnreadId(firstUnread?._id || null);
                setHasMoreMessages(data.length === 50);
                prevScrollHeightRef.current = null; // Reset on initial load
                setMessages(data);
                setTimeout(() => markAsRead(currentChannel._id), 400);
            } catch (err) { console.error('Failed to fetch messages:', err); }
        };
        fetchMessages();

        const handleNewMessage = (message) => {
            const ch = currentChannelRef.current;
            // Skip if this message was sent by ME (already added optimistically)
            if (message.senderId?._id === user._id || message.senderId === user._id) return;
            if (message.channelId === ch?._id) {
                addMessage(message);
                setTimeout(() => markAsRead(ch._id), 300);
            } else {
                // Increment unread count for non-visible channels
                setUnreadCounts((prev) => ({
                    ...prev,
                    [message.channelId]: (prev[message.channelId] || 0) + 1,
                }));
            }
        };

        const handleMessagesRead = ({ channelId, updatedMessages }) => {
            if (channelId === currentChannelRef.current?._id) {
                setReadReceiptMap((prev) => {
                    const updated = { ...prev };
                    updatedMessages.forEach((msg) => { updated[msg._id] = msg.readBy; });
                    readReceiptMapRef.current = updated;
                    return updated;
                });
            }
        };

        const handleUserTyping = ({ channelId, user: u }) => {
            if (channelId === currentChannelRef.current?._id && u._id !== user._id)
                setTypingUsers((prev) => prev.find(x => x._id === u._id) ? prev : [...prev, u]);
        };

        const handleStopTyping = ({ channelId, user: u }) => {
            if (channelId === currentChannelRef.current?._id)
                setTypingUsers((prev) => prev.filter(x => x._id !== u._id));
        };

        socket.on('newMessage', handleNewMessage);
        socket.on('messagesRead', handleMessagesRead);
        socket.on('userTyping', handleUserTyping);
        socket.on('userStopTyping', handleStopTyping);

        return () => {
            socket.off('newMessage', handleNewMessage);
            socket.off('messagesRead', handleMessagesRead);
            socket.off('userTyping', handleUserTyping);
            socket.off('userStopTyping', handleStopTyping);
        };
    }, [currentChannel, setMessages, addMessage, user._id, markAsRead]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedFile) || !currentChannel || isUploading) return;

        const txt = newMessage, rid = replyingTo?._id || null;
        setNewMessage(''); setReplyingTo(null);
        if (inputRef.current) inputRef.current.style.height = 'auto';
        socket.emit('stopTyping', { channelId: currentChannel._id, user });

        let finalAttachments = [];

        if (selectedFile) {
            setIsUploading(true);
            const formData = new FormData();
            formData.append('file', selectedFile);
            try {
                const { data: uploadData } = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                finalAttachments.push({
                    url: uploadData.url,
                    fileType: uploadData.type || 'unknown',
                    name: uploadData.name,
                    size: uploadData.size
                });
                setSelectedFile(null);
            } catch (err) {
                console.error('Upload failed:', err);
                setIsUploading(false);
                return; // Stop on failure
            }
            setIsUploading(false);
        }

        try {
            const { data } = await api.post('/messages', {
                channelId: currentChannel._id,
                text: txt,
                replyTo: rid,
                attachments: finalAttachments
            });
            // The API response now has senderId fully populated (name, username, avatar)
            addMessage(data);
            socket.emit('sendMessage', data);
            setTimeout(scrollToBottom, 50);
        } catch (err) { console.error('Failed to send:', err); }
    };

    const handleTyping = (e) => {
        const val = e.target.value;
        setNewMessage(val);

        const cursor = e.target.selectionStart;
        const textBeforeCursor = val.slice(0, cursor);
        const match = textBeforeCursor.match(/@(\w*)$/);

        if (match) {
            setMentionQuery(match[1]);
            setShowMentionFlyout(true);
            setMentionIndex(0);
        } else {
            setShowMentionFlyout(false);
        }

        if (!isTyping) { setIsTyping(true); socket.emit('typing', { channelId: currentChannel._id, user }); }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false); socket.emit('stopTyping', { channelId: currentChannel._id, user });
        }, 2000);
    };

    const insertMention = (userToMention) => {
        const cursor = inputRef.current?.selectionStart || newMessage.length;
        const textBefore = newMessage.slice(0, cursor).replace(/@\w*$/, `@${userToMention.username} `);
        const textAfter = newMessage.slice(cursor);
        setNewMessage(textBefore + textAfter);
        setShowMentionFlyout(false);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e) => {
        if (showMentionFlyout) {
            const filteredMembers = members.filter(m =>
                m.user?.username?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                m.user?.name?.toLowerCase().includes(mentionQuery.toLowerCase())
            );

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex(prev => (prev + 1) % filteredMembers.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredMembers[mentionIndex]) {
                    insertMention(filteredMembers[mentionIndex].user);
                }
            } else if (e.key === 'Escape') {
                setShowMentionFlyout(false);
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    };

    const handleInputResize = (e) => {
        handleTyping(e);
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
        }
    };

    const handleCreateChannel = async () => {
        const name = prompt('Enter channel name:'); if (!name) return;
        try {
            const { data } = await api.post('/channels', { workspaceId, name });
            setChannels([...channels, data]); setCurrentChannel(data);
        } catch (err) { console.error(err); }
    };

    const handleDeleteChannel = async (e, channelId) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this channel?')) return;
        try {
            await api.delete(`/channels/${channelId}`);
            const updatedChannels = channels.filter(c => c._id !== channelId);
            setChannels(updatedChannels);
            if (currentChannel?._id === channelId) {
                setCurrentChannel(updatedChannels.length > 0 ? updatedChannels[0] : null);
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to delete channel');
        }
    };

    const handleCreatePoll = async (e) => {
        e.preventDefault();
        const validOptions = pollOptions.filter(o => o.trim());
        if (!pollQuestion.trim() || validOptions.length < 2) return alert('Need a question and at least 2 options');

        const pollData = {
            question: pollQuestion,
            options: validOptions.map(text => ({ text, votes: [] }))
        };

        try {
            const { data } = await api.post('/messages', {
                channelId: currentChannel._id,
                text: 'Created a poll',
                poll: pollData
            });
            socket.emit('sendMessage', data);
            setShowPollModal(false);
            setPollQuestion('');
            setPollOptions(['', '']);
        } catch (err) {
            console.error('Failed to create poll:', err);
        }
    };

    const handleVoteOnPoll = async (msgId, optionId) => {
        try {
            const { data } = await api.post(`/messages/${msgId}/vote`, { optionId });
            setMessages(messages.map(m => m._id === msgId ? data : m));
        } catch (err) {
            console.error('Failed to vote:', err);
        }
    };

    const handleDeleteMessage = async (msgId) => {
        if (!confirm('Delete this message?')) return;
        try {
            await api.delete(`/messages/${msgId}`);
            setMessages(messages.filter((m) => m._id !== msgId));
        } catch (err) { alert(err.response?.data?.message || 'Failed to delete'); }
    };

    const handleConvertToTask = async (msg) => {
        try {
            await api.post('/tasks', { workspaceId, title: msg.text.length > 50 ? msg.text.substring(0, 50) + '...' : msg.text, description: `From message by ${msg.senderId?.name}:\n\n${msg.text}`, status: 'Todo' });
            alert('Converted to Task!');
        } catch (_) { alert('Failed to convert.'); }
    };

    const handleConvertToNote = async (msg) => {
        try {
            await api.post('/notes', { workspaceId, title: `Note from ${msg.senderId?.name} - ${format(new Date(msg.createdAt), 'MMM d')}`, content: msg.text });
            alert('Converted to Note!');
        } catch (_) { alert('Failed to convert.'); }
    };

    // Dismiss popover on outside click
    useEffect(() => {
        const dismiss = () => setOpenReceiptPopover(null);
        if (openReceiptPopover) { document.addEventListener('click', dismiss); return () => document.removeEventListener('click', dismiss); }
    }, [openReceiptPopover]);

    // ── Read Receipt Button Component ──
    const ReadReceiptBtn = ({ msgId }) => {
        const readers = readReceiptMap[msgId] || [];
        const otherReaders = readers.filter(r => {
            const id = typeof r.user === 'object' ? r.user?._id : r.user;
            return id?.toString() !== user._id?.toString();
        });
        const isOpen = openReceiptPopover === msgId;
        const isRead = otherReaders.length > 0;

        return (
            <div className="relative flex justify-end mt-0.5">
                <button
                    onClick={(e) => { e.stopPropagation(); setOpenReceiptPopover(isOpen ? null : msgId); }}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-400 transition-colors"
                    title={isRead ? `Read by ${otherReaders.length}` : 'Sent, not yet read'}
                >
                    {isRead
                        ? <CheckCheck size={12} className="text-indigo-400" />
                        : <Check size={12} className="text-gray-300" />}
                    {isRead && <span className="text-[9px] text-indigo-400">{otherReaders.length}</span>}
                </button>

                {isOpen && (
                    <div className="absolute bottom-6 right-0 z-50 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-xl p-3 min-w-[170px] max-w-[240px]">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold mb-2 pb-1 border-b border-gray-100 dark:border-slate-700">
                            {isRead ? `Read by ${otherReaders.length}` : 'Not yet read'}
                        </p>
                        {isRead ? otherReaders.map((r, i) => {
                            const ru = r.user;
                            const name = typeof ru === 'object' ? ru?.name : 'User';
                            const uname = typeof ru === 'object' ? ru?.username : null;
                            const avatar = typeof ru === 'object' ? ru?.avatar : null;
                            const readAt = r.readAt ? format(new Date(r.readAt), 'h:mm a') : '';
                            return (
                                <div key={i} className="flex items-center gap-2 py-1.5">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden flex-shrink-0">
                                        {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{name}</p>
                                        {uname && <p className="text-[9px] text-indigo-400">@{uname}</p>}
                                        {readAt && <p className="text-[9px] text-gray-400">{readAt}</p>}
                                    </div>
                                </div>
                            );
                        }) : (
                            <p className="text-xs text-gray-400 dark:text-gray-500 py-1">Waiting for others...</p>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Profile popup dismiss on outside click
    useEffect(() => {
        const dismiss = () => setOpenProfilePopover(null);
        if (openProfilePopover) { document.addEventListener('click', dismiss); return () => document.removeEventListener('click', dismiss); }
    }, [openProfilePopover]);

    // Mini profile card component
    const ProfilePopover = ({ sender, isMe }) => {
        if (!sender || isMe) return null;
        return (
            <div className="absolute bottom-10 left-0 z-50 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-xl p-4 min-w-[180px] max-w-[220px]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 flex items-center justify-center text-white text-lg font-bold overflow-hidden flex-shrink-0">
                        {sender.avatar ? <img src={sender.avatar} alt={sender.name} className="w-full h-full object-cover" /> : sender.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">{sender.name}</p>
                        {sender.username && (
                            <p className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-0.5"><AtSign size={10} />@{sender.username}</p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (!currentChannel && channels.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
                <Hash size={48} className="mb-4 text-indigo-200" />
                <p className="mb-4">No channels yet.</p>
                <button onClick={handleCreateChannel} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100">Create First Channel</button>
            </div>
        );
    }

    return (
        <div className="flex h-full max-h-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden relative">

            {/* Mobile overlay */}
            {isSidebarOpen && <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}

            {/* ── Channel Sidebar ── */}
            <div className={`absolute md:relative w-56 h-full bg-slate-50 dark:bg-slate-800/50 border-r border-gray-100 dark:border-slate-700/50 flex flex-col z-30 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                <div className="p-4 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between flex-shrink-0">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Channels</h3>
                    <div className="flex gap-2">
                        {amIOwnerOrAdmin && (
                            <button onClick={handleCreateChannel} className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"><Plus size={16} /></button>
                        )}
                        <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400"><X size={16} /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-0.5">
                    {channels.map((ch) => {
                        const count = unreadCounts[ch._id] || 0;
                        const isActive = currentChannel?._id === ch._id;
                        return (
                            <div key={ch._id} className="relative group flex items-center">
                                <button
                                    onClick={() => { setCurrentChannel(ch); setIsSidebarOpen(false); }}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${isActive
                                        ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700/50 hover:text-gray-900 dark:hover:text-gray-200'
                                        }`}
                                >
                                    <div className="flex items-center min-w-0 pr-6">
                                        <Hash size={15} className={`mr-2 flex-shrink-0 ${isActive ? 'text-indigo-500' : 'text-gray-400 dark:text-gray-500'}`} />
                                        <span className={`truncate ${count > 0 && !isActive ? 'font-semibold text-gray-800 dark:text-gray-200' : ''}`}>{ch.name}</span>
                                    </div>
                                    <div className="flex items-center">
                                        {/* Unread badge */}
                                        {count > 0 && !isActive && (
                                            <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-indigo-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                                {count > 99 ? '99+' : count}
                                            </span>
                                        )}
                                        {/* Blue dot (no count) */}
                                        {(count > 0 && !isActive && count === undefined) ? (
                                            <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                                        ) : null}
                                    </div>
                                </button>
                                {amIOwnerOrAdmin && (
                                    <button
                                        onClick={(e) => handleDeleteChannel(e, ch._id)}
                                        className="absolute right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1 bg-transparent hover:bg-gray-200 dark:hover:bg-slate-700 rounded z-10"
                                        title="Delete Channel"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Chat Area ── */}
            {currentChannel ? (
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-slate-900">

                    {/* Header */}
                    <div className="flex-shrink-0 h-14 border-b border-gray-100 dark:border-slate-800 px-4 md:px-6 flex items-center">
                        <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <Hash size={20} />
                        </button>
                        <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center">
                            <Hash size={20} className="hidden md:block mr-2 text-gray-400 dark:text-gray-500" />
                            {currentChannel.name}
                        </h2>
                    </div>

                    {/* ── Messages List ── */}
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 min-h-0 overflow-y-auto hide-scrollbar p-4 md:p-6 space-y-3 bg-slate-50/30 dark:bg-slate-900/50"
                    >
                        {messages.map((msg, idx) => {
                            const isMe = msg.senderId?._id === user._id;
                            const sender = typeof msg.senderId === 'object' ? msg.senderId : null;
                            const senderName = sender?.name || 'Unknown';
                            const senderUsername = sender?.username || '';
                            const senderAvatar = sender?.avatar || '';
                            const isFirstUnread = msg._id === firstUnreadId;
                            const isProfileOpen = openProfilePopover === msg._id;
                            const prevMsg = idx > 0 ? messages[idx - 1] : null;
                            const showDateDivider = !prevMsg || (safeDate(msg.createdAt)?.toDateString() ?? '') !== (safeDate(prevMsg.createdAt)?.toDateString() ?? '');

                            return (
                                <div key={msg._id || idx}>
                                    {/* ── Date Divider ── */}
                                    {showDateDivider && (
                                        <div className="flex justify-center my-4 sticky top-2 z-10">
                                            <span className="text-[10px] font-semibold text-gray-500 bg-white dark:bg-slate-800 px-3 py-1 rounded-full shadow-sm border border-gray-100 dark:border-slate-700">
                                                {getDateLabel(msg.createdAt)}
                                            </span>
                                        </div>
                                    )}

                                    {/* ── First Unread Divider ── */}
                                    {isFirstUnread && (
                                        <div
                                            ref={firstUnreadRef}
                                            className="flex items-center gap-3 my-3 px-2"
                                        >
                                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-60" />
                                            <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full whitespace-nowrap border border-indigo-200 dark:border-indigo-700/50">
                                                New Messages
                                            </span>
                                            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-indigo-400 to-transparent opacity-60" />
                                        </div>
                                    )}

                                    {/* ── Message Row ── */}
                                    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`flex ${isMe ? 'flex-row-reverse' : 'flex-row'} max-w-[85%] sm:max-w-[78%] md:max-w-[70%]`}>

                                            {/* Avatar — click to open profile */}
                                            <div className={`flex-shrink-0 ${isMe ? 'ml-2' : 'mr-2'} mt-1 self-end relative`}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setOpenProfilePopover(isProfileOpen ? null : msg._id); }}
                                                    className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold overflow-hidden shadow-sm hover:ring-2 hover:ring-indigo-300 transition-all cursor-pointer"
                                                >
                                                    {senderAvatar ? <img src={senderAvatar} alt="av" className="w-full h-full object-cover" /> : senderName?.charAt(0)?.toUpperCase()}
                                                </button>
                                                {/* Profile popup — only for others, not self */}
                                                {isProfileOpen && !isMe && (
                                                    <ProfilePopover sender={sender} isMe={isMe} />
                                                )}
                                            </div>

                                            <div className={`flex flex-col min-w-0 ${isMe ? 'items-end' : 'items-start'}`}>
                                                {/* @username + time */}
                                                <div className={`flex items-baseline gap-1.5 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                        {isMe ? 'You' : (senderUsername ? `@${senderUsername}` : senderName)}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{safeFormat(msg.createdAt, 'h:mm a')}</span>
                                                </div>

                                                {/* Bubble + action buttons */}
                                                <div className={`flex items-end gap-1.5 group ${isMe ? 'flex-row-reverse' : ''}`}>
                                                    <div className="flex flex-col min-w-0 max-w-full">
                                                        {/* Reply preview */}
                                                        {msg.replyTo && (
                                                            <div className="flex items-start text-xs text-gray-500 dark:text-gray-400 mb-1 bg-gray-100/70 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border-l-2 border-indigo-400">
                                                                <Reply size={11} className="mr-1.5 mt-0.5 flex-shrink-0 text-indigo-400" />
                                                                <div className="min-w-0">
                                                                    <span className="font-medium mr-1">{msg.replyTo.senderId?._id === user._id ? 'You' : msg.replyTo.senderId?.name || 'Someone'}:</span>
                                                                    <span className="break-words">{msg.replyTo.text}</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Main bubble */}
                                                        {msg.poll?.question ? (
                                                            <div className={`mt-2 p-4 shadow-sm border rounded-2xl min-w-[200px] sm:min-w-[250px] ${isMe ? 'bg-indigo-50 border-indigo-100 dark:bg-slate-700 dark:border-slate-600' : 'bg-gray-50 border-gray-100 dark:bg-slate-800 dark:border-slate-700'}`}>
                                                                <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-3 text-sm">{msg.poll.question}</h4>
                                                                <div className="space-y-2">
                                                                    {msg.poll.options.map((opt) => {
                                                                        const totalVotes = msg.poll.options.reduce((sum, o) => sum + o.votes.length, 0);
                                                                        const percent = totalVotes === 0 ? 0 : Math.round((opt.votes.length / totalVotes) * 100);
                                                                        const hasVoted = opt.votes.some(v => (v._id || v) === user._id);
                                                                        return (
                                                                            <button
                                                                                key={opt._id}
                                                                                onClick={() => handleVoteOnPoll(msg._id, opt._id)}
                                                                                className={`relative w-full text-left p-2 rounded-lg border transition-all overflow-hidden block ${hasVoted ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-slate-500'}`}
                                                                            >
                                                                                <div
                                                                                    className="absolute left-0 top-0 bottom-0 bg-indigo-100 dark:bg-indigo-500/20 transition-all duration-500"
                                                                                    style={{ width: `${percent}%` }}
                                                                                />
                                                                                <div className="relative flex justify-between items-center z-10 px-1">
                                                                                    <span className={`text-sm ${hasVoted ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{opt.text}</span>
                                                                                    <span className="text-xs text-gray-500 font-medium">{percent}% ({opt.votes.length})</span>
                                                                                </div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="mt-2 text-[10px] text-gray-400 text-right">
                                                                    Total votes: {msg.poll.options.reduce((sum, o) => sum + o.votes.length, 0)}
                                                                </div>
                                                            </div>
                                                        ) : (msg.text && (
                                                            <div
                                                                className={`px-4 py-2.5 shadow-sm text-sm whitespace-pre-wrap ${isMe
                                                                    ? 'bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl rounded-tr-sm'
                                                                    : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-slate-700 rounded-2xl rounded-tl-sm'
                                                                    }`}
                                                                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                                            >
                                                                {msg.text}
                                                            </div>
                                                        ))}

                                                        {/* Attachments */}
                                                        {msg.attachments?.length > 0 && (
                                                            <div className="flex flex-col gap-2 mt-2">
                                                                {msg.attachments.map((att, i) => {
                                                                    const isImg = att.fileType?.startsWith('image/');
                                                                    if (isImg) {
                                                                        return <img key={i} src={att.url} alt="attachment" className="max-w-xs sm:max-w-sm rounded-xl cursor-pointer object-cover border border-gray-200 dark:border-slate-700 hover:opacity-90 transition-opacity" onClick={() => window.open(att.url, '_blank')} />
                                                                    } else {
                                                                        const handleDownload = async (url, name) => {
                                                                            try {
                                                                                const response = await api.get(`/upload/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`, { responseType: 'blob' });
                                                                                const blob = new Blob([response.data]);
                                                                                const objectUrl = URL.createObjectURL(blob);
                                                                                const link = document.createElement('a');
                                                                                link.href = objectUrl;
                                                                                link.download = name || 'download';
                                                                                link.click();
                                                                                URL.revokeObjectURL(objectUrl);
                                                                            } catch (error) {
                                                                                console.error('Download failed:', error);
                                                                                alert('Failed to download file.');
                                                                            }
                                                                        };

                                                                        return (
                                                                            <div key={i} onClick={() => handleDownload(att.url, att.name || 'Document')} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border ${isMe ? 'bg-indigo-700/50 border-indigo-600 hover:bg-indigo-700' : 'bg-gray-100 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-700'}`}>
                                                                                <File size={20} className={isMe ? 'text-indigo-200' : 'text-indigo-500'} />
                                                                                <div className="flex flex-col min-w-0 pointer-events-none">
                                                                                    <span className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>{att.name || 'Document'}</span>
                                                                                    {att.size && <span className={`text-[10px] ${isMe ? 'text-indigo-200' : 'text-gray-500'}`}>{(att.size / 1024 / 1024).toFixed(2)} MB</span>}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Read receipt (sender only) */}
                                                        {isMe && <ReadReceiptBtn msgId={msg._id} />}
                                                    </div>

                                                    {/* Hover actions */}
                                                    <div className={`opacity-0 group-hover:opacity-100 flex items-center gap-0.5 bg-white dark:bg-slate-800 shadow-sm border border-gray-100 dark:border-slate-700 rounded-lg p-1 transition-opacity flex-shrink-0 self-center ${isMe ? 'mr-1' : 'ml-1'}`}>
                                                        <button onClick={() => setReplyingTo(msg)} title="Reply" className="p-1 hover:bg-indigo-50 dark:hover:bg-slate-700 text-gray-400 hover:text-indigo-600 rounded"><Reply size={14} /></button>
                                                        <button onClick={() => handleConvertToTask(msg)} title="Convert to Task" className="p-1 hover:bg-indigo-50 dark:hover:bg-slate-700 text-gray-400 hover:text-indigo-600 rounded"><CheckSquare size={14} /></button>
                                                        <button onClick={() => handleConvertToNote(msg)} title="Convert to Note" className="p-1 hover:bg-emerald-50 dark:hover:bg-slate-700 text-gray-400 hover:text-emerald-600 rounded"><FileText size={14} /></button>
                                                        {(isMe || user.role === 'admin' || user.role === 'owner') && (
                                                            <button onClick={() => handleDeleteMessage(msg._id)} title="Delete" className="p-1 hover:bg-red-50 dark:hover:bg-slate-700 text-gray-400 hover:text-red-500 rounded"><Trash2 size={14} /></button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Typing indicator */}
                        {typingUsers.length > 0 && (
                            <div className="flex items-center text-xs text-gray-400 italic pl-2">
                                <div className="flex space-x-1 mr-2 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                {typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* ── Input Area ── */}
                    <div className="flex-shrink-0 p-3 md:p-4 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 flex flex-col">
                        {replyingTo && (
                            <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 px-3 py-2 rounded-t-xl border border-gray-100 dark:border-slate-700 border-b-0 -mb-2 pb-3 z-0">
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 truncate">
                                    <Reply size={14} className="text-indigo-500 flex-shrink-0" />
                                    <span className="font-semibold flex-shrink-0">Replying to {replyingTo.senderId?.name || 'Someone'}:</span>
                                    <span className="truncate text-gray-400">{replyingTo.text}</span>
                                </div>
                                <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 flex-shrink-0"><X size={14} /></button>
                            </div>
                        )}
                        {selectedFile && (
                            <div className="flex items-center justify-between bg-indigo-50 dark:bg-slate-800 px-3 py-2 border border-indigo-100 dark:border-slate-700 rounded-t-xl z-0 mb-1 mx-2 relative top-2">
                                <div className="flex items-center gap-2 text-sm text-indigo-700 dark:text-indigo-300 truncate font-medium">
                                    <Paperclip size={14} className="flex-shrink-0" />
                                    <span className="truncate">{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                                </div>
                                <button onClick={() => setSelectedFile(null)} className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200 p-1 rounded-full flex-shrink-0 transition-colors bg-white/50 dark:bg-slate-700/50 hover:bg-white dark:hover:bg-slate-700"><X size={14} /></button>
                            </div>
                        )}
                        <form onSubmit={handleSendMessage} className="relative z-10 w-full flex flex-col">
                            {/* Mention Flyout */}
                            {showMentionFlyout && (
                                <div className="absolute bottom-full left-4 mb-2 w-64 max-h-48 overflow-y-auto hide-scrollbar bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-xl rounded-xl z-20">
                                    {members
                                        .filter(m => m.user?.username?.toLowerCase().includes(mentionQuery.toLowerCase()) || m.user?.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
                                        .map((m, idx) => (
                                            <div
                                                key={m.user._id}
                                                onClick={() => insertMention(m.user)}
                                                className={`flex items-center gap-3 px-4 py-2 cursor-pointer ${idx === mentionIndex ? 'bg-indigo-50 dark:bg-slate-700' : 'hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                                            >
                                                {m.user.avatar ? <img src={m.user.avatar} className="w-6 h-6 rounded-full" alt="avatar" /> : <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">{m.user.name.charAt(0)}</div>}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{m.user.name}</span>
                                                    <span className="text-xs text-gray-500 truncate">@{m.user.username}</span>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                            <div className="relative flex items-center w-full">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
                                        e.target.value = null; // reset
                                    }}
                                />
                                <div className="absolute left-3 flex items-center gap-1 z-20">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700">
                                        <Paperclip size={18} />
                                    </button>
                                    <button type="button" onClick={() => setShowPollModal(true)} className="p-1.5 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700">
                                        <BarChart2 size={18} />
                                    </button>
                                </div>
                                <textarea
                                    ref={inputRef}
                                    value={newMessage}
                                    onChange={handleInputResize}
                                    onKeyDown={handleKeyDown}
                                    placeholder={isUploading ? 'Uploading...' : `Message #${currentChannel.name}`}
                                    disabled={isUploading}
                                    rows={1}
                                    className="w-full pl-20 pr-12 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-slate-700/80 focus:bg-white dark:focus:bg-slate-800 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-500/50 rounded-xl focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm text-gray-800 disabled:opacity-50 resize-none hide-scrollbar min-h-[46px]"
                                    style={{ maxHeight: '150px' }}
                                />
                                <button
                                    type="submit"
                                    disabled={(!newMessage.trim() && !selectedFile) || isUploading}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
                                >
                                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <CornerDownRight size={16} />}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="text-center p-8 max-w-sm">
                        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100 dark:border-indigo-800/50">
                            <Hash size={32} className="text-indigo-400 dark:text-indigo-500" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">No Channel Selected</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Select a channel from the sidebar or create a new one to start chatting.</p>
                        <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mt-4 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900 transition-colors rounded-lg text-sm font-medium">
                            View Channels List
                        </button>
                    </div>
                </div>
            )}
            {/* Poll Creation Modal */}
            {showPollModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowPollModal(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/80">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><BarChart2 size={18} className="text-indigo-500" /> Create Poll</h3>
                            <button onClick={() => setShowPollModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleCreatePoll} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Question</label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={pollQuestion}
                                    onChange={(e) => setPollQuestion(e.target.value)}
                                    placeholder="Ask your team a question..."
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-sm"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Options</label>
                                {pollOptions.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={opt}
                                            onChange={(e) => {
                                                const newOpts = [...pollOptions];
                                                newOpts[idx] = e.target.value;
                                                setPollOptions(newOpts);
                                            }}
                                            placeholder={`Option ${idx + 1}`}
                                            className="flex-1 px-4 py-2 bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm transition-all"
                                        />
                                        {pollOptions.length > 2 && (
                                            <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button type="button" onClick={() => setPollOptions([...pollOptions, ''])} className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium flex items-center gap-1 mt-2">
                                    <Plus size={14} /> Add option
                                </button>
                            </div>
                            <div className="pt-2">
                                <button type="submit" disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-200 dark:shadow-none font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    Send Poll
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
