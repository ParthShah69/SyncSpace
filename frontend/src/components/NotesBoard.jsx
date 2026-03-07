import { useState, useEffect, useRef } from 'react';
import {
    Plus, FileText, Calendar, Clock, CheckCircle2, Trash2, Menu, X,
    Download, FileDown, FileCode2, Users, Shield, ShieldCheck,
    CheckSquare, Square, Save, Loader2, Search, Settings
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import api from '../utils/api';
import { format } from 'date-fns';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useSearchParams } from 'react-router-dom';

export default function NotesBoard({ workspaceId }) {
    const { user } = useAuthStore();
    const { workspaces } = useWorkspaceStore();
    const workspace = workspaces.find(w => w._id === workspaceId);

    const [notes, setNotes] = useState([]);
    const [activeNote, setActiveNote] = useState(null);
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [checklists, setChecklists] = useState([]);

    const [searchParams] = useSearchParams();
    const highlightId = searchParams.get('highlight');

    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showPermissionsModal, setShowPermissionsModal] = useState(false);
    const [mobileView, setMobileView] = useState('editor'); // 'editor' or 'checklist'

    const quillRef = useRef(null);
    const saveTimeoutRef = useRef(null);

    useEffect(() => {
        if (!workspaceId) return;
        const fetchNotes = async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/notes/workspace/${workspaceId}`);
                setNotes(data);

                if (highlightId) {
                    const target = data.find(n => n._id === highlightId);
                    if (target) selectNote(target);
                    else if (data.length > 0) selectNote(data[0]);
                } else if (data.length > 0) {
                    selectNote(data[0]);
                } else {
                    setActiveNote(null);
                }
            } catch (error) {
                console.error("Failed to fetch notes", error);
            } finally {
                setLoading(false);
            }
        };
        fetchNotes();
    }, [workspaceId, highlightId]);

    // Inject native title tooltips on Quill toolbar buttons after editor mounts
    useEffect(() => {
        const timer = setTimeout(() => {
            const addTitle = (selector, title) => {
                document.querySelectorAll(selector).forEach(el => el.setAttribute('title', title));
            };

            addTitle('.ql-bold', 'Bold');
            addTitle('.ql-italic', 'Italic');
            addTitle('.ql-underline', 'Underline');
            addTitle('.ql-strike', 'Strikethrough');
            addTitle('.ql-blockquote', 'Blockquote');
            addTitle('.ql-link', 'Insert Link');
            addTitle('.ql-image', 'Insert Image');
            addTitle('.ql-video', 'Insert Video');
            addTitle('.ql-code-block', 'Code Block');
            addTitle('.ql-clean', 'Clear Formatting');
            addTitle('button.ql-list[value="ordered"]', 'Ordered List');
            addTitle('button.ql-list[value="bullet"]', 'Bullet List');
            addTitle('button.ql-script[value="sub"]', 'Subscript');
            addTitle('button.ql-script[value="super"]', 'Superscript');
            addTitle('button.ql-indent[value="-1"]', 'Decrease Indent');
            addTitle('button.ql-indent[value="+1"]', 'Increase Indent');
            addTitle('button.ql-direction[value="rtl"]', 'Text Direction');

            // Pickers
            addTitle('.ql-header .ql-picker-label', 'Heading');
            addTitle('.ql-size .ql-picker-label', 'Text Size');
            addTitle('.ql-color .ql-picker-label', 'Text Color');
            addTitle('.ql-background .ql-picker-label', 'Background Color');
            addTitle('.ql-font .ql-picker-label', 'Font Family');
            addTitle('.ql-align .ql-picker-label', 'Text Alignment');

        }, 300);
        return () => clearTimeout(timer);
    }, [activeNote]);

    const selectNote = (note) => {
        setActiveNote(note);
        setTitle(note.title || 'Untitled Note');
        setContent(note.content || '');
        setChecklists(note.checklists || []);
        setIsSidebarOpen(false);
    };

    const myMemberData = workspace?.members?.find(m => (m.user?._id || m.user).toString() === user._id.toString());
    const isAdmin = myMemberData?.role === 'owner' || myMemberData?.role === 'admin';
    const isCreator = activeNote?.creator && (activeNote.creator._id || activeNote.creator).toString() === user._id.toString();
    const canEdit = isAdmin || isCreator || activeNote?.allowedEditors?.some(eId => eId.toString() === user._id.toString());

    const handleCreateNote = async () => {
        try {
            const { data } = await api.post('/notes', {
                workspaceId,
                title: 'Strategic Intel',
                content: '',
                checklists: [],
                allowedEditors: [user._id]
            });
            setNotes([data, ...notes]);
            selectNote(data);
        } catch (error) {
            console.error("Failed to create note", error);
        }
    };

    const handleDeleteNote = async (e, noteId) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this note?')) return;
        try {
            await api.delete(`/notes/${noteId}`);
            setNotes(notes.filter(n => n._id !== noteId));
            if (activeNote?._id === noteId) {
                setActiveNote(null);
                setTitle('');
                setContent('');
            }
        } catch (error) {
            console.error("Failed to delete note", error);
        }
    };

    // Enhanced auto-save logic
    useEffect(() => {
        if (!activeNote || !canEdit) return;

        // Check if anything actually changed
        const hasTitleChanged = title !== activeNote.title;
        const hasContentChanged = content !== activeNote.content;
        const hasChecklistChanged = JSON.stringify(checklists) !== JSON.stringify(activeNote.checklists);

        if (!hasTitleChanged && !hasContentChanged && !hasChecklistChanged) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            setIsSaving(true);
            try {
                const { data } = await api.put(`/notes/${activeNote._id}`, {
                    title,
                    content,
                    checklists
                });
                setNotes(notes.map(n => n._id === data._id ? data : n));
                setActiveNote(prev => ({ ...prev, ...data }));
            } catch (error) {
                console.error("Failed to save note", error);
            } finally {
                setIsSaving(false);
            }
        }, 1500);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [title, content, checklists, activeNote?._id, canEdit]);

    const handleToggleCheckItem = (idx) => {
        if (!canEdit) return;
        const newChecklists = [...checklists];
        newChecklists[idx].completed = !newChecklists[idx].completed;
        setChecklists(newChecklists);
    };

    const handleAddCheckItem = () => {
        if (!canEdit) return;
        setChecklists([...checklists, { text: 'New tactical item', completed: false }]);
    };

    const handleRemoveCheckItem = (idx) => {
        if (!canEdit) return;
        setChecklists(checklists.filter((_, i) => i !== idx));
    };

    const handleUpdateCheckText = (idx, text) => {
        if (!canEdit) return;
        const newChecklists = [...checklists];
        newChecklists[idx].text = text;
        setChecklists(newChecklists);
    };

    const handleUpdatePermissions = async (userIds) => {
        try {
            const { data } = await api.put(`/notes/${activeNote._id}`, {
                allowedEditors: userIds
            });
            setActiveNote(data);
            setNotes(notes.map(n => n._id === data._id ? data : n));
        } catch (error) {
            console.error("Failed to update permissions", error);
        }
    };

    const [showExportMenu, setShowExportMenu] = useState(false);

    const handleExportTxt = () => {
        if (!activeNote) return;
        const textToSave = quillRef.current?.getEditor().getText() || activeNote.content.replace(/<[^>]+>/g, '');
        const blob = new Blob([textToSave], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${activeNote.title || 'Note'}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        setShowExportMenu(false);
    };

    const handleExportPdf = async () => {
        if (!activeNote) return;
        setIsSaving(true);
        setShowExportMenu(false);
        try {
            const editorEl = document.querySelector('.ql-editor');
            if (!editorEl) return;

            const printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            document.body.appendChild(printFrame);

            const frameWindow = printFrame.contentWindow;
            const frameDoc = frameWindow.document;

            frameDoc.open();
            frameDoc.write(`
                <html>
                <head>
                    <title>${activeNote.title || 'Note'}</title>
                    <style>
                        body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; padding: 40px; color: #000; }
                        h1, h2, h3 { margin-bottom: 0.5em; }
                        p { margin-bottom: 1em; }
                        code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
                        pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; font-family: monospace; }
                        img { max-width: 100%; height: auto; }
                        blockquote { border-left: 4px solid #e5e7eb; padding-left: 16px; color: #4b5563; margin-left: 0; }
                        @media print {
                            body { padding: 0; }
                            @page { margin: 20mm; }
                        }
                    </style>
                </head>
                <body>
                    <h1>${activeNote.title || 'Untitled'}</h1>
                    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    ${editorEl.innerHTML}
                </body>
                </html>
            `);
            frameDoc.close();

            // Wait for resources then print
            frameWindow.focus();
            setTimeout(() => {
                frameWindow.print();
                document.body.removeChild(printFrame);
            }, 250);
        } catch (error) {
            console.error('Failed to export PDF', error);
            alert('PDF Export failed.');
        } finally {
            setIsSaving(false);
        }
    };

    // Dismiss popover on outside click
    useEffect(() => {
        const dismiss = () => setShowExportMenu(false);
        if (showExportMenu) { document.addEventListener('click', dismiss); return () => document.removeEventListener('click', dismiss); }
    }, [showExportMenu]);

    if (loading) {
        return <div className="flex-1 p-8 flex justify-center text-gray-400 dark:text-gray-500">Loading notes...</div>;
    }

    return (
        <div className="flex h-full bg-[var(--bg-main)] overflow-hidden rounded-3xl shadow-2xl border border-[var(--border-color)] relative transition-all duration-500 font-sans">

            {/* Premium Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-md z-40 md:hidden animate-in fade-in duration-300"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar: Notes Navigation */}
            <div className={`absolute md:relative w-80 h-full bg-[var(--bg-surface)] backdrop-blur-xl border-r border-[var(--border-color)] flex flex-col z-50 transition-all duration-500 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 shadow-2xl md:shadow-none'}`}>
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-surface)]">
                    <div className="flex flex-col">
                        <h2 className="font-black text-[var(--text-primary)] text-xl tracking-tight uppercase flex items-center gap-2">
                            <FileText size={20} className="text-[var(--brand-primary)]" />
                            Tactical Hub
                        </h2>
                        <span className="text-[9px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em] mt-1">Intelligence Repository</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleCreateNote}
                        className="w-10 h-10 brand-gradient-bg text-white rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-[var(--brand-primary)]/20"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-[var(--bg-main)]/30">
                    {notes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-40">
                            <Search size={48} className="mb-4 text-[var(--text-disabled)]" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-disabled)] leading-relaxed">System clear. No tactical intel found.</p>
                        </div>
                    ) : (
                        notes.map(note => (
                            <div key={note._id} className="relative group">
                                <button
                                    type="button"
                                    onClick={() => selectNote(note)}
                                    className={`w-full text-left p-4 rounded-2xl transition-all border group-hover:scale-[1.02] active:scale-[0.98] ${activeNote?._id === note._id
                                        ? 'bg-[var(--bg-surface)] border-[var(--brand-primary)] shadow-xl shadow-[var(--brand-primary)]/10 ring-1 ring-[var(--brand-primary)]/30'
                                        : 'bg-transparent border-transparent hover:bg-[var(--bg-surface)] hover:border-[var(--border-color)]'
                                        }`}
                                >
                                    <h4 className={`font-black text-sm truncate pr-8 tracking-tight ${activeNote?._id === note._id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] opacity-70 group-hover:opacity-100'}`}>
                                        {note.title || 'Untitled Strategic Document'}
                                    </h4>
                                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-[var(--text-disabled)] mt-3">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={10} />
                                            {note.updatedAt ? format(new Date(note.updatedAt), 'MMM d, yyyy') : 'Live'}
                                        </div>
                                        {note.checklists?.length > 0 && (
                                            <div className="flex items-center gap-1 text-[var(--brand-secondary)]">
                                                <CheckSquare size={10} />
                                                {note.checklists.filter(c => c.completed).length}/{note.checklists.length}
                                            </div>
                                        )}
                                    </div>
                                </button>
                                {(isAdmin || String(note.lastEditedBy) === String(user._id)) && (
                                    <button
                                        onClick={(e) => handleDeleteNote(e, note._id)}
                                        className="absolute right-3 top-4 opacity-0 group-hover:opacity-100 p-2 text-[var(--text-disabled)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all z-10"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Content Area: High-Performance Editor */}
            {activeNote ? (
                <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-surface)] relative transition-all duration-500">

                    {/* Editor Header: Mission-Critical Controls */}
                    <div className="h-20 border-b border-[var(--border-color)] px-6 md:px-10 flex items-center justify-between bg-[var(--bg-surface)]/80 backdrop-blur-xl sticky top-0 z-40">
                        <div className="flex flex-1 items-center min-w-0 mr-4">
                            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mr-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-2 rounded-xl hover:bg-[var(--bg-main)] transition-all">
                                <Menu size={20} />
                            </button>
                            <div className="flex flex-col flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    {!canEdit && <Shield size={14} className="text-[var(--text-disabled)] shrink-0" />}
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        readOnly={!canEdit}
                                        className={`text-xl font-black text-[var(--text-primary)] bg-transparent border-none focus:ring-0 outline-none w-full tracking-tight transition-all ${!canEdit ? 'cursor-not-allowed opacity-70' : ''}`}
                                        placeholder="Intelligence Subject"
                                    />
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[9px] font-black text-[var(--text-disabled)] uppercase tracking-[0.2em]">Strategy File {activeNote._id.slice(-6)}</span>
                                    {!canEdit && <span className="text-[8px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded">Read Only</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            <div className="hidden sm:flex items-center mr-4">
                                {isSaving ? (
                                    <div className="flex items-center text-[10px] font-black text-[var(--brand-primary)] uppercase tracking-widest animate-pulse">
                                        <Loader2 size={12} className="mr-2 animate-spin" /> Syncing Hub...
                                    </div>
                                ) : (
                                    <div className="flex items-center text-[10px] font-black text-[var(--brand-secondary)] uppercase tracking-widest opacity-60">
                                        <ShieldCheck size={12} className="mr-2" /> Verified & Saved
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 bg-[var(--bg-main)] p-1.5 rounded-2xl border border-[var(--border-color)] shadow-sm">
                                {(isAdmin || isCreator) && (
                                    <button
                                        onClick={() => setShowPermissionsModal(true)}
                                        className="p-2.5 text-[var(--text-secondary)] hover:text-[var(--brand-primary)] hover:bg-[var(--bg-surface)] rounded-xl transition-all"
                                        title="Team Access"
                                    >
                                        <Users size={18} />
                                    </button>
                                )}
                                <div className="w-px h-6 bg-[var(--border-color)]" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }}
                                    className="p-2.5 text-[var(--text-secondary)] hover:text-[var(--brand-secondary)] hover:bg-[var(--bg-surface)] rounded-xl transition-all relative"
                                    title="Export Intel"
                                >
                                    <Download size={18} />
                                    {showExportMenu && (
                                        <div className="absolute top-12 right-0 z-[60] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl py-2 min-w-[200px] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                                            <div className="px-4 py-2 border-b border-[var(--border-color)] mb-1">
                                                <span className="text-[9px] font-black text-[var(--text-disabled)] uppercase tracking-widest">Select Protocol</span>
                                            </div>
                                            <button onClick={handleExportPdf} className="w-full text-left px-4 py-3 text-xs font-black text-[var(--text-primary)] hover:bg-[var(--bg-main)] flex items-center gap-3 uppercase tracking-tighter transition-all">
                                                <FileDown size={14} className="text-red-500" /> Secure PDF Export
                                            </button>
                                            <button onClick={handleExportTxt} className="w-full text-left px-4 py-3 text-xs font-black text-[var(--text-primary)] hover:bg-[var(--bg-main)] flex items-center gap-3 uppercase tracking-tighter transition-all">
                                                <FileCode2 size={14} className="text-blue-500" /> Structural Text Export
                                            </button>
                                        </div>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                    {/* Mobile View Toggle */}
                    <div className="flex md:hidden bg-[var(--bg-main)] p-1.5 border-b border-[var(--border-color)]">
                        <button
                            onClick={() => setMobileView('editor')}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mobileView === 'editor' ? 'brand-gradient-bg text-white shadow-md' : 'text-[var(--text-disabled)]'}`}
                        >
                            Editor
                        </button>
                        <button
                            onClick={() => setMobileView('checklist')}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mobileView === 'checklist' ? 'brand-gradient-bg text-white shadow-md' : 'text-[var(--text-disabled)]'}`}
                        >
                            Objectives
                        </button>
                    </div>

                    {/* Dual-Pane Layout: Editor & Checklist */}
                    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[var(--bg-main)]/20">
                        {/* Editor View */}
                        <div className={`${mobileView === 'editor' ? 'flex' : 'hidden md:flex'} flex-[3] flex flex-col overflow-hidden relative border-r border-[var(--border-color)]/30`}>
                            <div className="flex-1 overflow-hidden quill-syncspace-wrapper relative">
                                <ReactQuill
                                    ref={quillRef}
                                    theme="snow"
                                    value={content || ''}
                                    onChange={setContent}
                                    readOnly={!canEdit}
                                    className={`h-full editor-main-view ${!canEdit ? 'read-only-mode' : ''}`}
                                    placeholder="Initiating secure intelligence feed..."
                                    modules={{
                                        toolbar: [
                                            [{ 'header': [1, 2, 3, false] }],
                                            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                                            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                                            ['link', 'code-block'],
                                            ['clean']
                                        ]
                                    }}
                                />
                            </div>
                        </div>

                        {/* Tactical Checklist Sidebar */}
                        <div className={`${mobileView === 'checklist' ? 'flex' : 'hidden md:flex'} flex-1 flex flex-col bg-[var(--bg-surface)]/50 backdrop-blur-sm p-6 overflow-y-auto custom-scrollbar border-l border-[var(--border-color)]`}>
                            <div className="flex items-center justify-between mb-6">
                                <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                                    <CheckSquare size={16} className="text-[var(--brand-secondary)]" />
                                    Tactical Objectives
                                </h4>
                                {canEdit && (
                                    <button
                                        onClick={handleAddCheckItem}
                                        className="p-1.5 bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)] rounded-lg hover:bg-[var(--brand-secondary)] hover:text-white transition-all"
                                    >
                                        <Plus size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4">
                                {checklists.length === 0 ? (
                                    <div className="py-10 text-center opacity-30">
                                        <p className="text-[9px] font-black uppercase tracking-widest">No objectives assigned</p>
                                    </div>
                                ) : (
                                    checklists.map((item, idx) => (
                                        <div key={idx} className="group flex items-start gap-3 bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-color)] shadow-sm hover:shadow-md transition-all hover:scale-[1.02]">
                                            <button
                                                onClick={() => handleToggleCheckItem(idx)}
                                                disabled={!canEdit}
                                                className={`mt-1 transition-all ${item.completed ? 'text-[var(--brand-secondary)]' : 'text-[var(--text-disabled)]'}`}
                                            >
                                                {item.completed ? <CheckCircle2 size={18} /> : <Square size={18} />}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <input
                                                    type="text"
                                                    value={item.text}
                                                    onChange={(e) => handleUpdateCheckText(idx, e.target.value)}
                                                    readOnly={!canEdit}
                                                    className={`w-full bg-transparent border-none p-0 text-xs font-bold focus:ring-0 outline-none tracking-tight ${item.completed ? 'line-through opacity-50' : 'text-[var(--text-primary)]'}`}
                                                />
                                            </div>
                                            {
                                                canEdit && (
                                                    <button
                                                        onClick={() => handleRemoveCheckItem(idx)}
                                                        className="opacity-0 group-hover:opacity-100 text-[var(--text-disabled)] hover:text-red-500 transition-all"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )
                                            }
                                        </div >
                                    ))
                                )
                                }
                            </div >
                        </div >
                    </div >

                    {/* Permission Manager Modal (Admins & Creators Only) */}
                    {
                        showPermissionsModal && (isAdmin || isCreator) && (
                            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowPermissionsModal(false)}>
                                <div className="bg-[var(--bg-surface)] rounded-2xl md:rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-400 border border-[var(--border-color)]" onClick={e => e.stopPropagation()}>
                                    <div className="p-6 md:p-8 border-b border-[var(--border-color)] bg-[var(--bg-main)]/30">
                                        <h3 className="text-xl font-black text-[var(--text-primary)] tracking-tight uppercase">Strategic Access Control</h3>
                                        <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest mt-1">Assign Edit Protocol to Specialists</p>
                                    </div>
                                    <div className="p-6 md:p-8 max-h-[50vh] md:max-h-[60vh] overflow-y-auto custom-scrollbar space-y-3">
                                        {workspace?.members?.map(m => {
                                            const mUser = m.user;
                                            if (!mUser) return null;
                                            const noteCreatorId = (activeNote.creator?._id || activeNote.creator);
                                            const isNoteCreator = String(noteCreatorId) === String(mUser._id);
                                            const isWorkspaceOwner = m.role === 'owner';
                                            const isAllowed = isWorkspaceOwner || isNoteCreator || (activeNote.allowedEditors || []).some(id => String(id) === String(mUser._id));

                                            return (
                                                <div key={mUser._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)]/20 gap-3">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl brand-gradient-bg flex items-center justify-center text-white font-black shadow-sm">
                                                            {mUser.name?.charAt(0)}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-[var(--text-primary)] tracking-tight truncate max-w-[150px]">{mUser.name}</span>
                                                            <span className="text-[9px] font-black text-[var(--text-disabled)] uppercase tracking-widest">{m.role}</span>
                                                        </div>
                                                    </div>
                                                    {(isWorkspaceOwner || isNoteCreator) ? (
                                                        <span className="text-[8px] font-black text-[var(--brand-primary)] uppercase tracking-widest bg-[var(--brand-primary)]/10 px-2 py-1 rounded">Locked Access</span>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                const currentIds = activeNote.allowedEditors || [];
                                                                const newIds = isAllowed
                                                                    ? currentIds.filter(id => String(id) !== String(mUser._id))
                                                                    : [...currentIds, mUser._id];
                                                                handleUpdatePermissions(newIds);
                                                            }}
                                                            className={`w-full sm:w-auto px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAllowed ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)] border border-[var(--brand-secondary)]/20'}`}
                                                        >
                                                            {isAllowed ? 'Revoke Protocol' : 'Grant Protocol'}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="p-4 md:p-6 bg-[var(--bg-main)]/30 border-t border-[var(--border-color)] flex justify-end">
                                        <button onClick={() => setShowPermissionsModal(false)} className="w-full sm:w-auto px-8 py-3 brand-gradient-bg text-white rounded-2xl font-black text-xs shadow-xl shadow-[var(--brand-primary)]/20 transform hover:scale-105 active:scale-95 transition-all">Secure Hub Protocol</button>
                                    </div>
                                </div>
                            </div>
                        )
                    }
                </div >
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-main)]/30 relative overflow-hidden">
                    <div className="relative z-10 text-center p-12 max-w-md">
                        <div className="w-24 h-24 brand-gradient-bg rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-[var(--brand-primary)]/40 transform -rotate-12 animate-float">
                            <FileText size={48} className="text-white" />
                        </div>
                        <h3 className="text-2xl font-black text-[var(--text-primary)] mb-4 tracking-tighter uppercase">Intelligence Gap Detected</h3>
                        <p className="text-sm font-bold text-[var(--text-secondary)] opacity-60 leading-relaxed mb-10">Select a strategic document from the hub or initiate a new intelligence protocol to start documenting your tactical mission.</p>
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="md:hidden w-full py-4 bg-[var(--bg-surface)] text-[var(--brand-primary)] rounded-2xl font-black text-xs uppercase tracking-widest border border-[var(--border-color)] shadow-xl transform active:scale-95 transition-all"
                        >
                            Access Tactical Hub
                        </button>
                    </div>
                </div>
            )}
        </div >
    );
}
