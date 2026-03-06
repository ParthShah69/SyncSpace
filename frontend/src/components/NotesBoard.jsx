import { useState, useEffect, useRef } from 'react';
import { Plus, FileText, Calendar, Clock, CheckCircle2, Trash2, Menu, X, Download, FileDown, FileCode2 } from 'lucide-react';
import api from '../utils/api';
import { format } from 'date-fns';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

export default function NotesBoard({ workspaceId }) {
    const [notes, setNotes] = useState([]);
    const [activeNote, setActiveNote] = useState(null);
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const quillRef = useRef(null);

    useEffect(() => {
        if (!workspaceId) return;
        const fetchNotes = async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/notes/workspace/${workspaceId}`);
                setNotes(data);
                if (data.length > 0) {
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
    }, [workspaceId]);

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
        setIsSidebarOpen(false);
    };

    const handleCreateNote = async () => {
        try {
            const { data } = await api.post('/notes', {
                workspaceId,
                title: 'Untitled Note',
                content: '',
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

    // Simple auto-save simulation with debouncing
    useEffect(() => {
        if (!activeNote) return;

        // Only save if content or title changed
        if (activeNote.title === title && activeNote.content === content) return;

        const timeoutId = setTimeout(async () => {
            setIsSaving(true);
            try {
                const { data } = await api.put(`/notes/${activeNote._id}`, { title, content });
                // Update list
                setNotes(notes.map(n => n._id === data._id ? data : n));
                setActiveNote(data);
            } catch (error) {
                console.error("Failed to save note", error);
            } finally {
                setIsSaving(false);
            }
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [title, content, activeNote?._id]); // intentional dependencies

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
        <div className="flex h-full bg-white dark:bg-slate-900 overflow-hidden rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 relative transition-colors duration-200">

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-20 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar: Notes List */}
            <div className={`absolute md:relative w-72 h-full bg-slate-50 dark:bg-slate-800/50 border-r border-gray-100 dark:border-slate-700/50 flex flex-col z-30 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                <div className="p-4 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between z-10">
                    <h2 className="font-bold text-gray-800 dark:text-gray-200 flex items-center">
                        <FileText size={18} className="mr-2 text-emerald-500 dark:text-emerald-400" /> Notes
                    </h2>
                    <div className="flex space-x-2">
                        <button
                            type="button"
                            onClick={handleCreateNote}
                            className="p-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors"
                        >
                            <Plus size={16} />
                        </button>
                        <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {notes.length === 0 ? (
                        <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-8 p-4">
                            No notes yet. Create one to start writing.
                        </div>
                    ) : (
                        notes.map(note => (
                            <div key={note._id} className="relative group">
                                <button
                                    type="button"
                                    onClick={() => selectNote(note)}
                                    className={`w-full text-left p-3 rounded-xl transition-all border ${activeNote?._id === note._id
                                        ? 'bg-white dark:bg-slate-700 border-emerald-200 dark:border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/20'
                                        : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-slate-700/50'
                                        }`}
                                >
                                    <h4 className={`font-medium text-sm truncate pr-6 ${activeNote?._id === note._id ? 'text-emerald-800 dark:text-emerald-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {note.title || 'Untitled Note'}
                                    </h4>
                                    <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                                        <div className="flex items-center">
                                            <Calendar size={10} className="mr-1" />
                                            {note.updatedAt ? format(new Date(note.updatedAt), 'MMM d, yyyy') : 'Just now'}
                                        </div>
                                    </div>
                                </button>
                                <button
                                    onClick={(e) => handleDeleteNote(e, note._id)}
                                    className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Editor Area */}
            {activeNote ? (
                <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 relative">

                    {/* Editor Header */}
                    <div className="h-14 border-b border-gray-100 dark:border-slate-800 px-4 md:px-6 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 transition-colors duration-200">
                        <div className="flex flex-1 items-center">
                            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <Menu size={20} />
                            </button>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="text-lg font-bold text-gray-800 dark:text-gray-100 bg-transparent border-none focus:ring-0 outline-none w-full"
                                placeholder="Note Title"
                            />
                        </div>

                        <div className="flex items-center text-xs text-gray-400 dark:text-gray-500 ml-4 shrink-0 relative">
                            {isSaving ? (
                                <span className="flex items-center text-emerald-600 dark:text-emerald-400 mr-3"><Clock size={12} className="mr-1 animate-pulse" /> Saving...</span>
                            ) : (
                                <span className="flex items-center mr-3"><CheckCircle2 size={12} className="mr-1" /> Saved</span>
                            )}

                            <button
                                onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }}
                                className="flex items-center justify-center p-1.5 ml-1 text-gray-500 hover:text-emerald-600 bg-gray-100 hover:bg-emerald-50 dark:bg-slate-800 dark:text-gray-400 dark:hover:text-emerald-400 dark:hover:bg-slate-700 rounded-md transition-colors"
                                title="Export Note"
                            >
                                <Download size={16} />
                            </button>

                            {showExportMenu && (
                                <div className="absolute top-10 right-0 z-50 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-xl py-2 min-w-[160px]" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={handleExportPdf}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                    >
                                        <FileDown size={14} className="text-red-500" /> Export as PDF
                                    </button>
                                    <button
                                        onClick={handleExportTxt}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                    >
                                        <FileCode2 size={14} className="text-blue-500" /> Export as TXT
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Editor Textarea / Quill */}
                    <div className="flex-1 overflow-hidden relative quill-dark-wrapper flex flex-col">
                        <ReactQuill
                            ref={quillRef}
                            theme="snow"
                            value={content || ''}
                            onChange={setContent}
                            className="flex-1 flex flex-col h-full editor-container dark:text-gray-100"
                            placeholder="Start writing securely..."
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
            ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-50/50 dark:bg-slate-900/50">
                    <div className="text-center p-8 max-w-sm">
                        <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-emerald-800/50">
                            <FileText size={32} className="text-emerald-400 dark:text-emerald-500" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">No Note Selected</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Select a note from the sidebar or create a new one to start writing.</p>
                        <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mt-4 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium">
                            View Notes List
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
