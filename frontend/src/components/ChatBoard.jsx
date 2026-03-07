import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { socket } from '../socket';
import {
    Hash, CornerDownRight, CheckSquare, FileText, Reply, X, Plus,
    Trash2, Check, CheckCheck, AtSign, BarChart2, Paperclip, File, Loader2,
    BellOff, Bell, Menu, Send, LogOut
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

    const myMemberData = user ? members.find(m => String((m.user?._id || m.user)) === String(user._id)) : null;
    const amIOwnerOrAdmin = myMemberData?.role === 'owner' || myMemberData?.role === 'admin';

    const [newMessage, setNewMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [typingUsers, setTypingUsers] = useState([]);
    const [replyingTo, setReplyingTo] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchParams] = useSearchParams();
    const highlightId = searchParams.get('highlight');
    const [readReceiptMap, setReadReceiptMap] = useState({});   // msgId -> readBy[]
    const [openReceiptPopover, setOpenReceiptPopover] = useState(null);
    const [unreadCounts, setUnreadCounts] = useState({});       // channelId -> number
    const [firstUnreadId, setFirstUnreadId] = useState(null);   // first unread msg _id
    const [openProfilePopover, setOpenProfilePopover] = useState(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(true); // Added loading state

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
            // Only scroll to bottom if not highlighting and not loading
            if (!highlightId && !loadingMessages) {
                scrollToBottom();
            }
        }
    }, [messages, typingUsers, currentChannel, highlightId, loadingMessages]);

    // Scroll to highlight or bottom on initial load/channel change
    useEffect(() => {
        if (!loadingMessages && messages.length > 0) {
            if (highlightId) {
                const el = document.getElementById(`msg-${highlightId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }
            }
            scrollToBottom();
        }
    }, [loadingMessages, currentChannel?._id, messages.length, highlightId]);

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

                // Respect channel search param if present
                const channelIdParam = new URLSearchParams(window.location.search).get('channel');
                if (channelIdParam) {
                    const targetChannel = data.find(c => c._id === channelIdParam);
                    if (targetChannel) {
                        setCurrentChannel(targetChannel);
                    } else {
                        setCurrentChannel(null);
                    }
                } else {
                    setCurrentChannel(null);
                }
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

    const handleToggleMute = async (e, channelId) => {
        e.stopPropagation();
        try {
            const isMuted = user.mutedChannels?.some(id => String(id) === String(channelId));
            let updatedMuted;
            if (isMuted) {
                updatedMuted = user.mutedChannels.filter(id => String(id) !== String(channelId));
            } else {
                updatedMuted = [...(user.mutedChannels || []), channelId];
            }
            const { data } = await api.put('/auth/profile', { mutedChannels: updatedMuted });
            useAuthStore.getState().setUser(data);
        } catch (error) {
            console.error('Failed to toggle mute:', error);
        }
    };

    const handleLeaveChannel = async (e, channelId) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to leave this channel? You won't see it in your list until you are manually re-added or you reset your settings.")) return;
        try {
            const updatedLeft = [...(user.leftChannels || []), channelId];
            const { data } = await api.put('/auth/profile', { leftChannels: updatedLeft });
            useAuthStore.getState().setUser(data);
            if (currentChannel?._id === channelId) setCurrentChannel(null);
            // Refresh channels
            const { data: channelsData } = await api.get(`/channels/${workspaceId}`);
            setChannels(channelsData);
        } catch (error) {
            console.error('Failed to leave channel:', error);
        }
    };

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
        if (!currentChannel) return;  // Guard: no channel selected yet

        setLoadingMessages(true); // Start loading messages

        // Join the channel room — must wait until socket is actually connected
        const joinChannel = () => socket.emit('joinChannel', currentChannel._id);
        if (socket.connected) {
            joinChannel();
        } else {
            socket.once('connect', joinChannel);
            socket.connect();
        }

        const fetchMessages = async () => {
            try {
                const { data } = await api.get(`/messages/${currentChannel._id}`);
                // Determine the first unread message before marking read
                const firstUnread = data.find((msg) =>
                    !msg.readBy?.some(r =>
                        (typeof r.user === 'object' ? r.user?._id : r.user)?.toString() === user?._id?.toString()
                    )
                );
                setFirstUnreadId(firstUnread?._id || null);
                setHasMoreMessages(data.length === 50);
                prevScrollHeightRef.current = null; // Reset on initial load
                setMessages(data);
                setTimeout(() => markAsRead(currentChannel._id), 400);
            } catch (err) { console.error('Failed to fetch messages:', err); }
            finally {
                setLoadingMessages(false); // End loading messages
            }
        };
        fetchMessages();

        const handleNewMessage = (message) => {
            const ch = currentChannelRef.current;
            // Skip if this message was sent by ME (already added optimistically)
            if (user && (message.senderId?._id === user?._id || message.senderId === user?._id)) return;
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
            if (channelId === currentChannelRef.current?._id && u._id !== user?._id)
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
            socket.off('connect', joinChannel);  // clean up pending once listener
            socket.off('newMessage', handleNewMessage);
            socket.off('messagesRead', handleMessagesRead);
            socket.off('userTyping', handleUserTyping);
            socket.off('userStopTyping', handleStopTyping);
        };
    }, [currentChannel, setMessages, addMessage, user?._id, markAsRead]);

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
            <div className="absolute bottom-12 left-0 z-50 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-5 min-w-[200px] max-w-[240px] animate-in slide-in-from-bottom-2 duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full brand-gradient-bg flex items-center justify-center text-white text-xl font-black overflow-hidden flex-shrink-0 shadow-lg shadow-[var(--brand-primary)]/20 p-0.5">
                        {sender.avatar ? <img src={sender.avatar} alt={sender.name} className="w-full h-full object-cover rounded-full border-2 border-[var(--bg-surface)]" /> : <div className="w-full h-full rounded-full flex items-center justify-center bg-[var(--bg-surface)] text-[var(--brand-primary)]">{sender.name?.charAt(0)?.toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0">
                        <p className="font-black text-sm text-[var(--text-primary)] truncate tracking-tight">{sender.name}</p>
                        {sender.username && (
                            <p className="text-[10px] font-black text-[var(--brand-secondary)] uppercase tracking-widest flex items-center gap-1 mt-0.5"><AtSign size={10} />{sender.username}</p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (!currentChannel && channels.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-disabled)] bg-[var(--bg-surface)] rounded-2xl shadow-sm border border-[var(--border-color)] p-8">
                <div className="w-20 h-20 brand-gradient-bg rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-[var(--brand-primary)]/20 transform rotate-3">
                    <Hash size={40} className="text-white" />
                </div>
                <p className="mb-6 font-black text-[var(--text-primary)] uppercase tracking-widest text-sm">No channels found</p>
                <button onClick={handleCreateChannel} className="brand-gradient-bg text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-[var(--brand-primary)]/20 transform hover:scale-105 active:scale-95 transition-all">Create First Channel</button>
            </div>
        );
    }

    return (
        <div className="flex h-full max-h-full bg-[var(--bg-main)] rounded-2xl shadow-sm border border-[var(--border-color)] overflow-hidden relative transition-colors duration-200">

            {/* Mobile overlay */}
            {isSidebarOpen && <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}

            {/* ── Channel Sidebar ── */}
            <div className={`absolute md:relative w-64 h-full bg-[var(--bg-surface)] border-r border-[var(--border-color)] flex flex-col z-30 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between flex-shrink-0">
                    <h3 className="font-black text-[var(--text-primary)] text-xs uppercase tracking-widest">Channels</h3>
                    <div className="flex gap-2">
                        {amIOwnerOrAdmin && (
                            <button onClick={handleCreateChannel} className="text-[var(--text-disabled)] hover:text-[var(--brand-primary)] transition-all transform hover:scale-110"><Plus size={18} /></button>
                        )}
                        <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-[var(--text-disabled)] hover:text-[var(--text-primary)]"><X size={18} /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                    {channels.map((ch) => {
                        const count = unreadCounts[ch._id] || 0;
                        const isActive = currentChannel?._id === ch._id;
                        return (
                            <div
                                key={ch._id}
                                onClick={() => { setCurrentChannel(ch); setIsSidebarOpen(false); }}
                                className={`relative group flex items-center justify-between px-4 py-2.5 text-xs rounded-xl transition-all duration-300 cursor-pointer ${isActive
                                    ? 'brand-gradient-bg text-white shadow-lg shadow-[var(--brand-primary)]/20 font-black tracking-wide'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-main)] hover:text-[var(--text-primary)] font-bold'
                                    }`}
                            >
                                <div className="flex items-center min-w-0 pr-6">
                                    <Hash size={14} className={`mr-2.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-[var(--brand-secondary)]'}`} />
                                    <span className={`truncate ${count > 0 && !isActive ? 'brand-gradient-text' : ''}`}>{ch.name}</span>
                                </div>
                                <div className="flex items-center">
                                    {/* Mute toggle and Leave Channel */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => handleToggleMute(e, ch._id)}
                                            className={`p-1.5 rounded-lg hover:bg-[var(--bg-main)] transition-colors ${user.mutedChannels?.some(id => String(id) === String(ch._id)) ? 'text-[var(--brand-primary)]' : 'text-[var(--text-disabled)]'}`}
                                            title={user.mutedChannels?.some(id => String(id) === String(ch._id)) ? "Unmute" : "Mute"}
                                        >
                                            {user.mutedChannels?.some(id => String(id) === String(ch._id)) ? <BellOff size={12} /> : <Bell size={12} />}
                                        </button>
                                        {ch.name !== 'general' && (
                                            <button
                                                onClick={(e) => handleLeaveChannel(e, ch._id)}
                                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-disabled)] hover:text-red-500 transition-colors"
                                                title="Leave Channel"
                                            >
                                                <LogOut size={12} />
                                            </button>
                                        )}
                                    </div>
                                    {/* Unread badge */}
                                    {count > 0 && !isActive && (
                                        <div className="min-w-[18px] h-[18px] flex items-center justify-center brand-gradient-bg text-white text-[9px] font-black rounded-full px-1 shadow-lg shadow-[var(--brand-primary)]/20 scale-90 group-hover:scale-100 transition-transform">
                                            {count}
                                        </div>
                                    )}
                                </div>
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
                    <div className="flex-shrink-0 h-16 border-b border-[var(--border-color)] px-6 flex items-center justify-between bg-[var(--bg-surface)]">
                        <div className="flex items-center min-w-0">
                            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mr-4 text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition-colors">
                                <Menu size={20} />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[var(--bg-main)] flex items-center justify-center text-[var(--brand-primary)] shadow-sm">
                                    <Hash size={20} />
                                </div>
                                <h2 className="font-black text-[var(--text-primary)] text-lg tracking-tight truncate">
                                    {currentChannel.name}
                                </h2>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Potential channel actions could go here */}
                        </div>
                    </div>

                    {/* ── Messages List ── */}
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-4 bg-[var(--bg-main)]/50"
                    >
                        {messages.map((msg, idx) => {
                            const isMe = msg.senderId?._id === user?._id;
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
                                        <div className="flex justify-center my-8 sticky top-0 z-10 transition-all duration-300">
                                            <span className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] bg-[var(--bg-surface)] px-5 py-1.5 rounded-full shadow-lg shadow-black/5 border border-[var(--border-color)] backdrop-blur-md">
                                                {getDateLabel(msg.createdAt)}
                                            </span>
                                        </div>
                                    )}

                                    {/* ── First Unread Divider ── */}
                                    {isFirstUnread && (
                                        <div
                                            ref={firstUnreadRef}
                                            className="flex items-center gap-4 my-6 px-4"
                                        >
                                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-30" />
                                            <span className="text-[9px] font-black text-white bg-red-500 px-4 py-1.5 rounded-full whitespace-nowrap border-2 border-[var(--bg-surface)] shadow-lg shadow-red-500/20 uppercase tracking-widest">
                                                New Messages
                                            </span>
                                            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-red-500 to-transparent opacity-30" />
                                        </div>
                                    )}

                                    {/* ── Message Row ── */}
                                    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`flex ${isMe ? 'flex-row-reverse' : 'flex-row'} max-w-[85%] sm:max-w-[78%] md:max-w-[70%]`}>

                                            {/* Avatar — click to open profile */}
                                            <div className={`flex-shrink-0 ${isMe ? 'ml-3' : 'mr-3'} mt-2 self-end relative`}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setOpenProfilePopover(isProfileOpen ? null : msg._id); }}
                                                    className={`w-10 h-10 rounded-full brand-gradient-bg flex items-center justify-center text-white text-xs font-black overflow-hidden shadow-md transition-all cursor-pointer p-0.5 transform hover:scale-110 active:scale-90 ${isMe ? 'ring-2 ring-[var(--brand-primary)]/20 shadow-[var(--brand-primary)]/20' : 'ring-2 ring-[var(--brand-secondary)]/20 shadow-[var(--brand-secondary)]/20'}`}
                                                >
                                                    <div className="w-full h-full rounded-full border-2 border-[var(--bg-surface)] overflow-hidden flex items-center justify-center bg-[var(--bg-surface)] text-[var(--text-primary)]">
                                                        {senderAvatar ? <img src={senderAvatar} alt="av" className="w-full h-full object-cover" /> : senderName?.charAt(0)?.toUpperCase()}
                                                    </div>
                                                </button>
                                                {/* Profile popup — only for others, not self */}
                                                {isProfileOpen && !isMe && (
                                                    <ProfilePopover sender={sender} isMe={isMe} />
                                                )}
                                            </div>

                                            <div className={`flex flex-col min-w-0 ${isMe ? 'items-end' : 'items-start'}`}>
                                                {/* @username + time */}
                                                <div className={`flex items-baseline gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                                                    <span className="text-[10px] font-black text-[var(--text-primary)] uppercase tracking-wider">
                                                        {isMe ? 'You' : (senderUsername ? `@${senderUsername}` : senderName)}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-[var(--text-disabled)] uppercase">{safeFormat(msg.createdAt, 'h:mm a')}</span>
                                                </div>

                                                {/* Bubble + action buttons */}
                                                <div className={`flex items-end gap-1.5 group ${isMe ? 'flex-row-reverse' : ''}`}>
                                                    <div className="flex flex-col min-w-0 max-w-full">
                                                        {/* Reply preview */}
                                                        {msg.replyTo && (
                                                            <div className="flex items-start text-[10px] text-[var(--text-secondary)] mb-1.5 bg-[var(--bg-surface)]/80 backdrop-blur-sm px-4 py-2 rounded-xl border-l-4 border-[var(--brand-primary)] shadow-sm">
                                                                <Reply size={12} className="mr-2 mt-0.5 flex-shrink-0 text-[var(--brand-primary)]" />
                                                                <div className="min-w-0">
                                                                    <span className="font-black mr-1 uppercase tracking-tighter">{msg.replyTo.senderId?._id === user._id ? 'You' : msg.replyTo.senderId?.name || 'Someone'}:</span>
                                                                    <span className="break-words font-medium opacity-80">{msg.replyTo.text}</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Main bubble */}
                                                        {msg.poll?.question ? (
                                                            <div id={`msg-${msg._id}`} className={`mt-2 p-6 shadow-xl border rounded-3xl min-w-[220px] sm:min-w-[300px] ${isMe ? 'bg-[var(--bg-surface)] border-[var(--brand-primary)]/30' : 'bg-[var(--bg-surface)] border-[var(--border-color)]'} ${highlightId === msg._id ? 'premium-glow shadow-2xl scale-[1.02]' : ''}`}>
                                                                <h4 className="font-black text-[var(--text-primary)] mb-4 text-sm tracking-tight">{msg.poll.question}</h4>
                                                                <div className="space-y-3">
                                                                    {msg.poll.options.map((opt) => {
                                                                        const totalVotes = msg.poll.options.reduce((sum, o) => sum + o.votes.length, 0);
                                                                        const percent = totalVotes === 0 ? 0 : Math.round((opt.votes.length / totalVotes) * 100);
                                                                        const hasVoted = opt.votes.some(v => (v._id || v) === user._id);
                                                                        return (
                                                                            <button
                                                                                key={opt._id}
                                                                                onClick={() => handleVoteOnPoll(msg._id, opt._id)}
                                                                                className={`relative w-full text-left p-3 rounded-2xl border transition-all overflow-hidden block ${hasVoted ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 shadow-lg shadow-[var(--brand-primary)]/10' : 'border-[var(--border-color)] bg-[var(--bg-main)]/50 hover:border-[var(--brand-secondary)]'}`}
                                                                            >
                                                                                <div
                                                                                    className="absolute left-0 top-0 bottom-0 brand-gradient-bg opacity-20 transition-all duration-700 ease-out"
                                                                                    style={{ width: `${percent}%` }}
                                                                                />
                                                                                <div className="relative flex justify-between items-center z-10 px-1">
                                                                                    <span className={`text-xs ${hasVoted ? 'font-black text-[var(--brand-primary)]' : 'font-bold text-[var(--text-primary)]'}`}>{opt.text}</span>
                                                                                    <span className="text-[10px] text-[var(--text-secondary)] font-black">{percent}%</span>
                                                                                </div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="mt-4 text-[9px] font-black text-[var(--text-disabled)] text-right uppercase tracking-widest">
                                                                    Total: {msg.poll.options.reduce((sum, o) => sum + o.votes.length, 0)} votes
                                                                </div>
                                                            </div>
                                                        ) : (msg.text && (
                                                            // Text Content with deep highlighting support
                                                            <div
                                                                id={`msg-${msg._id}`}
                                                                className={`relative px-4 py-2.5 sm:px-5 sm:py-3 shadow-md text-xs sm:text-sm whitespace-pre-wrap font-medium leading-relaxed ${isMe
                                                                    ? 'brand-gradient-bg text-white rounded-2xl sm:rounded-3xl rounded-tr-sm shadow-lg shadow-[var(--brand-primary)]/20'
                                                                    : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl sm:rounded-3xl rounded-tl-sm'
                                                                    } ${highlightId === msg._id ? 'premium-glow shadow-2xl scale-[1.02]' : ''} ${(() => {
                                                                        const isTagged = (msg.mentions || []).some(m => (m._id || m).toString() === user._id.toString()) ||
                                                                            (user?.name && msg.text?.toLowerCase().includes(`@${user.name.toLowerCase()}`)) ||
                                                                            (user?.username && msg.text?.toLowerCase().includes(`@${user.username.toLowerCase()}`));
                                                                        return isTagged ? 'tagged-pulse' : '';
                                                                    })()}`}
                                                                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                                            >
                                                                {msg.text}
                                                            </div>
                                                        ))}

                                                        {/* Attachments */}
                                                        {msg.attachments?.length > 0 && (
                                                            <div className="flex flex-col gap-3 mt-3">
                                                                {msg.attachments.map((att, i) => {
                                                                    const isImg = att.fileType?.startsWith('image/');
                                                                    if (isImg) {
                                                                        return <img key={i} src={att.url} alt="attachment" className="max-w-xs sm:max-w-sm rounded-2xl cursor-pointer shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all object-cover border-2 border-[var(--border-color)]" onClick={() => window.open(att.url, '_blank')} />
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
                                                                            }
                                                                        };

                                                                        return (
                                                                            <div key={i} onClick={() => handleDownload(att.url, att.name || 'Document')} className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border shadow-sm ${isMe ? 'bg-[var(--brand-primary)]/10 border-[var(--brand-primary)]/20 hover:bg-[var(--brand-primary)]/20 shadow-[var(--brand-primary)]/5' : 'bg-[var(--bg-surface)] border-[var(--border-color)] hover:bg-[var(--bg-main)] shadow-black/5'}`}>
                                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isMe ? 'bg-white/20 text-white' : 'brand-gradient-bg text-white shadow-md'}`}>
                                                                                    <File size={20} />
                                                                                </div>
                                                                                <div className="flex flex-col min-w-0 pointer-events-none">
                                                                                    <span className={`text-xs font-black truncate uppercase tracking-tight ${isMe ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]'}`}>{att.name || 'Document'}</span>
                                                                                    {att.size && <span className={`text-[9px] font-bold uppercase ${isMe ? 'text-[var(--brand-primary)]/60' : 'text-[var(--text-disabled)]'}`}>{(att.size / 1024 / 1024).toFixed(2)} MB</span>}
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

                                                    {/* Actions */}
                                                    <div className={`opacity-0 sm:group-hover:opacity-100 flex items-center gap-1 bg-[var(--bg-surface)] shadow-2xl border border-[var(--border-color)] rounded-2xl p-1.5 transition-all flex-shrink-0 self-center transform ${isMe ? 'mr-3 -translate-x-2' : 'ml-3 translate-x-2'}`}>
                                                        <button onClick={() => setReplyingTo(msg)} title="Reply" className="p-1.5 sm:p-2 hover:bg-[var(--bg-main)] text-[var(--text-disabled)] hover:text-[var(--brand-primary)] rounded-xl transition-all"><Reply size={14} className="sm:w-4 sm:h-4" /></button>
                                                        <button onClick={() => handleConvertToTask(msg)} title="Convert to Task" className="p-1.5 sm:p-2 hover:bg-[var(--bg-main)] text-[var(--text-disabled)] hover:text-[var(--brand-primary)] rounded-xl transition-all"><CheckSquare size={14} className="sm:w-4 sm:h-4" /></button>
                                                        <button onClick={() => handleConvertToNote(msg)} title="Convert to Note" className="p-1.5 sm:p-2 hover:bg-[var(--bg-main)] text-[var(--text-disabled)] hover:text-[var(--brand-secondary)] rounded-xl transition-all"><FileText size={14} className="sm:w-4 sm:h-4" /></button>
                                                        {(isMe || user.role === 'admin' || user.role === 'owner') && (
                                                            <button onClick={() => handleDeleteMessage(msg._id)} title="Delete" className="p-1.5 sm:p-2 hover:bg-red-50 text-[var(--text-disabled)] hover:text-red-500 rounded-xl transition-all"><Trash2 size={14} className="sm:w-4 sm:h-4" /></button>
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
                            <div className="flex items-center text-[10px] text-[var(--text-disabled)] font-black uppercase tracking-widest pl-4 mb-2 animate-pulse">
                                <div className="flex space-x-1 mr-3 bg-[var(--bg-surface)] px-2.5 py-1.5 rounded-full shadow-sm border border-[var(--border-color)]">
                                    <div className="w-1.5 h-1.5 brand-gradient-bg rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 brand-gradient-bg rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 brand-gradient-bg rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span>{typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* ── Input Area ── */}
                    <div className="flex-shrink-0 p-6 md:p-8 bg-[var(--bg-main)] border-t border-[var(--border-color)] flex flex-col relative">
                        {replyingTo && (
                            <div className="flex items-center justify-between bg-[var(--bg-surface)] px-5 py-3 rounded-2xl border border-[var(--border-color)] shadow-xl mb-3 animate-in slide-in-from-bottom-4 duration-300">
                                <div className="flex items-center gap-3 text-xs text-[var(--text-primary)] truncate">
                                    <div className="w-8 h-8 rounded-lg brand-gradient-bg flex items-center justify-center text-white">
                                        <Reply size={16} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-black uppercase tracking-tighter text-[10px] text-[var(--brand-primary)]">Replying to {replyingTo.senderId?._id === user._id ? 'You' : replyingTo.senderId?.name || 'Someone'}</span>
                                        <span className="truncate font-medium opacity-60 text-xs">{replyingTo.text}</span>
                                    </div>
                                </div>
                                <button onClick={() => setReplyingTo(null)} className="text-[var(--text-disabled)] hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition-all"><X size={18} /></button>
                            </div>
                        )}
                        {selectedFile && (
                            <div className="flex items-center justify-between bg-[var(--bg-surface)] px-5 py-3 rounded-2xl border border-[var(--border-color)] shadow-xl mb-3 animate-in slide-in-from-bottom-4 duration-300">
                                <div className="flex items-center gap-3 text-xs text-[var(--text-primary)] truncate">
                                    <div className="w-8 h-8 rounded-lg brand-gradient-bg flex items-center justify-center text-white">
                                        <Paperclip size={16} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-black uppercase tracking-tighter text-[10px] text-[var(--brand-secondary)]">Attached File</span>
                                        <span className="truncate font-medium opacity-60 text-xs">{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedFile(null)} className="text-[var(--text-disabled)] hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition-all"><X size={18} /></button>
                            </div>
                        )}
                        <form onSubmit={handleSendMessage} className="relative z-10 w-full flex flex-col">
                            {/* Mention Flyout */}
                            {showMentionFlyout && (
                                <div className="absolute bottom-full left-4 mb-4 w-72 max-h-60 overflow-y-auto custom-scrollbar bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-2xl rounded-2xl z-20 p-2 animate-in slide-in-from-bottom-2 duration-300">
                                    <div className="px-3 py-2 text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-widest border-b border-[var(--border-color)] mb-1">Mention Member</div>
                                    {members
                                        .filter(m => m.user?.username?.toLowerCase().includes(mentionQuery.toLowerCase()) || m.user?.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
                                        .map((m, idx) => (
                                            <div
                                                key={m.user?._id || idx}
                                                onClick={() => insertMention(m.user)}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-xl transition-all ${idx === mentionIndex ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'hover:bg-[var(--bg-main)] text-[var(--text-secondary)]'}`}
                                            >
                                                <div className="w-8 h-8 rounded-full brand-gradient-bg p-0.5 shadow-sm">
                                                    {m.user?.avatar ? <img src={m.user.avatar} className="w-full h-full rounded-full object-cover border-2 border-[var(--bg-surface)]" alt="avatar" /> : <div className="w-full h-full rounded-full bg-[var(--bg-surface)] flex items-center justify-center text-[var(--brand-primary)] text-[10px] font-black">{m.user?.name?.charAt(0)}</div>}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-xs font-black truncate tracking-tight">{m.user?.name}</span>
                                                    <span className="text-[10px] font-bold opacity-60 truncate">@{m.user?.username}</span>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                            <div className="relative flex items-center w-full bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-color)] shadow-xl shadow-black/5 focus-within:border-[var(--brand-primary)]/50 focus-within:shadow-[var(--brand-primary)]/10 transition-all group p-1">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
                                        e.target.value = null; // reset
                                    }}
                                />
                                <div className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 sm:p-2.5 text-[var(--text-disabled)] hover:text-[var(--brand-primary)] transition-all rounded-xl hover:bg-[var(--bg-main)]">
                                        <Paperclip size={18} className="sm:w-5 sm:h-5" />
                                    </button>
                                    <button type="button" onClick={() => setShowPollModal(true)} className="p-2 sm:p-2.5 text-[var(--text-disabled)] hover:text-[var(--brand-secondary)] transition-all rounded-xl hover:bg-[var(--bg-main)]">
                                        <BarChart2 size={18} className="sm:w-5 sm:h-5" />
                                    </button>
                                </div>
                                <textarea
                                    ref={inputRef}
                                    value={newMessage}
                                    onChange={handleInputResize}
                                    onKeyDown={handleKeyDown}
                                    placeholder={isUploading ? 'Uploading assets...' : `Message in #${currentChannel.name}`}
                                    disabled={isUploading}
                                    rows={1}
                                    className="w-full px-4 py-3.5 bg-transparent text-[var(--text-primary)] font-medium outline-none text-sm disabled:opacity-50 resize-none custom-scrollbar min-h-[50px] placeholder:text-[var(--text-disabled)] placeholder:font-black placeholder:uppercase placeholder:text-[10px] placeholder:tracking-widest"
                                    style={{ maxHeight: '200px' }}
                                />
                                <button
                                    type="submit"
                                    disabled={(!newMessage.trim() && !selectedFile) || isUploading}
                                    className="ml-2 mr-1 p-3 brand-gradient-bg text-white rounded-xl hover:scale-105 active:scale-95 disabled:opacity-30 disabled:grayscale disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-lg shadow-[var(--brand-primary)]/20 cursor-pointer flex-shrink-0"
                                >
                                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center bg-[var(--bg-main)]">
                    <div className="text-center p-12 max-w-sm">
                        <div className="w-24 h-24 brand-gradient-bg rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-[var(--brand-primary)]/30 transform rotate-6 hover:rotate-0 transition-transform duration-500">
                            <Hash size={40} className="text-white" />
                        </div>
                        <h3 className="text-2xl font-black text-[var(--text-primary)] mb-3 tracking-tight uppercase">Select a Channel</h3>
                        <p className="text-[var(--text-secondary)] text-sm font-medium leading-relaxed opacity-80">Join a conversation or create a new channel to start collaborating with your team.</p>
                        <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mt-8 px-8 py-3 brand-gradient-bg text-white shadow-lg shadow-[var(--brand-primary)]/20 hover:scale-105 active:scale-95 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest">
                            Browse Channels
                        </button>
                    </div>
                </div>
            )}

            {/* Poll Creation Modal */}
            {showPollModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in duration-300" onClick={() => setShowPollModal(false)}>
                    <div className="bg-[var(--bg-surface)] rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-400 border border-[var(--border-color)]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-8 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-surface)]">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl brand-gradient-bg flex items-center justify-center text-white shadow-lg shadow-[var(--brand-primary)]/20">
                                    <BarChart2 size={24} />
                                </div>
                                <h3 className="text-xl font-black text-[var(--text-primary)] tracking-tight">Create Poll</h3>
                            </div>
                            <button onClick={() => setShowPollModal(false)} className="text-[var(--text-disabled)] hover:text-[var(--text-primary)] p-2.5 rounded-2xl hover:bg-[var(--bg-main)] transition-all">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleCreatePoll} className="p-8 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mb-3 ml-1">Polling Question</label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={pollQuestion}
                                    onChange={(e) => setPollQuestion(e.target.value)}
                                    placeholder="What's your team's thoughts on..."
                                    className="w-full px-5 py-4 bg-[var(--bg-main)] text-[var(--text-primary)] font-bold border border-[var(--border-color)] rounded-2xl outline-none focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--brand-primary)]/10 transition-all text-sm placeholder:text-[var(--text-disabled)]/50"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="block text-[10px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mb-3 ml-1">Response Options</label>
                                {pollOptions.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={(e) => {
                                                    const newOpts = [...pollOptions];
                                                    newOpts[idx] = e.target.value;
                                                    setPollOptions(newOpts);
                                                }}
                                                placeholder={`Option ${idx + 1}`}
                                                className="w-full px-5 py-3.5 bg-[var(--bg-main)] text-[var(--text-primary)] font-bold border border-[var(--border-color)] rounded-2xl outline-none focus:border-[var(--brand-secondary)] transition-all text-sm"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-disabled)] font-black text-[10px]">{idx + 1}</div>
                                        </div>
                                        {pollOptions.length > 2 && (
                                            <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))} className="p-3 text-[var(--text-disabled)] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                                <X size={20} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setPollOptions([...pollOptions, ''])}
                                    className="w-full py-4 border-2 border-dashed border-[var(--border-color)] rounded-2xl text-[var(--text-disabled)] hover:text-[var(--brand-primary)] hover:border-[var(--brand-primary)]/50 hover:bg-[var(--brand-primary)]/5 transition-all text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2"
                                >
                                    <Plus size={16} /> Add Option
                                </button>
                            </div>
                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                                    className="w-full py-4 brand-gradient-bg text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-[var(--brand-primary)]/20 hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:grayscale transition-all"
                                >
                                    Launch Poll
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
