import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, FileText, Trash2, Zap, LogIn, LogOut, User as UserIcon, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import { supabase } from './lib/supabase';

interface Note {
  id: string;
  title: string;
  content: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [notes, setNotes] = useState<Note[]>([
    { id: '1', title: 'Men', content: 'Mening shaxsiy fikrlarim va maqsadlarim.' },
    { id: '2', title: 'Avtoritet', content: 'Avtoritetning ta\'siri juda kuchli. Bu #Men bilan bog‘liq.' }
  ]);
  const [activeNoteId, setActiveNoteId] = useState<string>('1');
  const [search, setSearch] = useState('');

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [cursorPos, setCursorPos] = useState(0);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nodesRef = useRef<(Note & { x: number; y: number; vx: number; vy: number })[]>([]);
  const isDraggingRef = useRef<{ node: any; offsetX: number; offsetY: number } | null>(null);
  const isPanningRef = useRef<{ startX: number; startY: number } | null>(null);

  const activeNote = notes.find(n => n.id === activeNoteId);

  // Supabase Auth listener
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: any } }) => setUser(user));
    const { data: authListener } = supabase.auth.onAuthStateChange((_: string, session: any) => {
      setUser(session?.user ?? null);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Note CRUD
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value;
    const selectionStart = e.target.selectionStart;
    setCursorPos(selectionStart);
    setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, content } : n));

    // `#` belgisini tekshirish (Autocomplete)
    const textBeforeCursor = content.slice(0, selectionStart);
    const hashMatch = textBeforeCursor.match(/#([a-zA-Z0-9_]*)$/);

    if (hashMatch) {
      setShowSuggestions(true);
      setSuggestionQuery(hashMatch[1].toLowerCase());
    } else {
      setShowSuggestions(false);
    }
  };

  const insertSuggestion = (title: string) => {
    if (!activeNote) return;
    const textBeforeCursor = activeNote.content.slice(0, cursorPos);
    const textAfterCursor = activeNote.content.slice(cursorPos);
    const lastHashIndex = textBeforeCursor.lastIndexOf('#');

    const newContent = textBeforeCursor.slice(0, lastHashIndex) + `#${title} ` + textAfterCursor;
    setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, content: newContent } : n));
    setShowSuggestions(false);
  };

  const createNewNote = () => {
    const newNote: Note = { id: Date.now().toString(), title: 'Yangi Fikr', content: '' };
    setNotes(prev => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
  };

  const deleteNote = (id: string) => {
    if (notes.length <= 1) return;
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeNoteId === id) setActiveNoteId(notes.find(n => n.id !== id)?.id || '');
  };

  // Physics & Canvas Rendering
  useEffect(() => {
    const currentNodes = nodesRef.current;
    nodesRef.current = notes.map(n => {
      const existing = currentNodes.find(cn => cn.id === n.id);
      return {
        ...n,
        x: existing ? existing.x : (Math.random() - 0.5) * 200 + 300,
        y: existing ? existing.y : (Math.random() - 0.5) * 200 + 300,
        vx: existing ? existing.vx : 0,
        vy: existing ? existing.vy : 0
      };
    });
  }, [notes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 600;
      canvas.height = canvas.parentElement?.clientHeight || 600;
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      
      // Zoom va Pan
      ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

      const nodes = nodesRef.current;
      const width = canvas.width;
      const height = canvas.height;

      // Force Physics
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = -2500 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          nodes[i].vx += fx;
          nodes[i].vy += fy;
          nodes[j].vx -= fx;
          nodes[j].vy -= fy;
        }

        nodes[i].vx += (width / 2 - nodes[i].x) * 0.005;
        nodes[i].vy += (height / 2 - nodes[i].y) * 0.005;
        nodes[i].vx *= 0.85;
        nodes[i].vy *= 0.85;

        if (!isDraggingRef.current || isDraggingRef.current.node.id !== nodes[i].id) {
          nodes[i].x += nodes[i].vx;
          nodes[i].y += nodes[i].vy;
        }
      }

      // Render Connections
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nI = nodes[i];
          const nJ = nodes[j];
          const mentionsJ = nI.content.toLowerCase().includes(`#${nJ.title.toLowerCase()}`);
          const mentionsI = nJ.content.toLowerCase().includes(`#${nI.title.toLowerCase()}`);

          if (mentionsJ || mentionsI) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.moveTo(nI.x, nI.y);
            ctx.lineTo(nJ.x, nJ.y);
            ctx.stroke();
          }
        }
      }

      // Render Nodes
      nodes.forEach(node => {
        const isActive = node.id === activeNoteId;
        if (isActive) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, isActive ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#ffffff' : '#8a8a9e';
        ctx.fill();

        ctx.font = '12px Inter, sans-serif';
        ctx.fillStyle = isActive ? '#ffffff' : '#71717a';
        ctx.fillText(node.title, node.x + 12, node.y + 4);
      });

      ctx.restore();
      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [activeNoteId, zoom, pan]);

  // Canvas Events
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prev => Math.min(Math.max(prev * zoomFactor, 0.4), 3));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const worldX = (rawX - canvasRef.current!.width / 2 - pan.x) / zoom + canvasRef.current!.width / 2;
    const worldY = (rawY - canvasRef.current!.height / 2 - pan.y) / zoom + canvasRef.current!.height / 2;

    const clickedNode = nodesRef.current.find(n => Math.hypot(n.x - worldX, n.y - worldY) < 15);

    if (clickedNode) {
      setActiveNoteId(clickedNode.id);
      isDraggingRef.current = { node: clickedNode, offsetX: worldX - clickedNode.x, offsetY: worldY - clickedNode.y };
    } else {
      isPanningRef.current = { startX: e.clientX - pan.x, startY: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const worldX = (rawX - canvasRef.current!.width / 2 - pan.x) / zoom + canvasRef.current!.width / 2;
      const worldY = (rawY - canvasRef.current!.height / 2 - pan.y) / zoom + canvasRef.current!.height / 2;

      isDraggingRef.current.node.x = worldX - isDraggingRef.current.offsetX;
      isDraggingRef.current.node.y = worldY - isDraggingRef.current.offsetY;
    } else if (isPanningRef.current) {
      setPan({
        x: e.clientX - isPanningRef.current.startX,
        y: e.clientY - isPanningRef.current.startY
      });
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = null;
    isPanningRef.current = null;
  };

  const suggestionsList = notes.filter(n => n.id !== activeNoteId && n.title.toLowerCase().includes(suggestionQuery));

  return (
    <div className="flex h-screen w-screen bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none font-sans">
      
      {/* 1. LEFT SIDEBAR */}
      <div className="w-72 border-r border-[#27272a] bg-[#121215] flex flex-col justify-between">
        <div>
          {/* LOGO HEADER */}
          <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white text-black flex items-center justify-center font-bold shadow-sm">
                <Zap className="w-4 h-4 fill-black" />
              </div>
              <span className="font-semibold text-xs tracking-widest uppercase">NEURAL LAB</span>
            </div>
            <button onClick={createNewNote} className="p-1.5 hover:bg-[#27272a] rounded-lg transition" title="Yangi eslatma">
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#71717a]" />
              <input
                type="text"
                placeholder="Qidirish..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#18181b] border border-[#27272a] rounded-md focus:outline-none focus:border-[#52525b] text-white"
              />
            </div>
          </div>

          {/* Note List */}
          <div className="px-2 space-y-0.5 overflow-y-auto max-h-[calc(100vh-180px)]">
            {notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase())).map(n => (
              <div
                key={n.id}
                onClick={() => setActiveNoteId(n.id)}
                className={`p-2 rounded-md text-xs cursor-pointer transition flex items-center gap-2 ${
                  n.id === activeNoteId ? 'bg-[#27272a] text-white font-medium' : 'hover:bg-[#18181b] text-[#a1a1aa]'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{n.title || 'Sarlavhasiz'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AUTH FOOTER */}
        <div className="p-3 border-t border-[#27272a] bg-[#09090b]">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <UserIcon className="w-4 h-4 text-[#a1a1aa]" />
                <span className="text-xs text-[#a1a1aa] truncate">{user.email}</span>
              </div>
              <button onClick={handleLogout} className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa]">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 py-1.5 bg-white text-black font-medium text-xs rounded-md hover:bg-zinc-200 transition"
            >
              <LogIn className="w-3.5 h-3.5" /> Google bilan kirish
            </button>
          )}
        </div>
      </div>

      {/* 2. EDITOR PANEL */}
      <div className="flex-1 flex flex-col border-r border-[#27272a] bg-[#09090b] relative">
        {activeNote ? (
          <>
            <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
              <input
                type="text"
                value={activeNote.title}
                onChange={e => setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, title: e.target.value } : n))}
                placeholder="Fikr sarlavhasi..."
                className="bg-transparent text-base font-semibold text-white focus:outline-none w-full"
              />
              <button onClick={() => deleteNote(activeNote.id)} className="p-1 hover:bg-[#27272a] text-[#71717a] hover:text-red-400 rounded transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 relative flex flex-col">
              <textarea
                ref={textareaRef}
                value={activeNote.content}
                onChange={handleContentChange}
                placeholder="Shu yerga yozing... Bog'lash uchun # deb yozing..."
                className="flex-1 w-full p-4 bg-transparent text-sm text-[#f4f4f5] focus:outline-none resize-none leading-relaxed"
              />

              {/* AUTOCOMPLETE SUGGESTIONS POPUP */}
              {showSuggestions && suggestionsList.length > 0 && (
                <div className="absolute bottom-10 left-4 w-64 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl overflow-hidden z-30">
                  <div className="p-1.5 text-[10px] text-[#71717a] border-b border-[#27272a] font-mono uppercase">Fikrlarni ulash</div>
                  {suggestionsList.map(item => (
                    <div
                      key={item.id}
                      onClick={() => insertSuggestion(item.title)}
                      className="px-3 py-2 text-xs hover:bg-[#27272a] cursor-pointer text-white transition flex items-center gap-2"
                    >
                      <span className="text-[#71717a]">#</span> {item.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[#71717a]">Fikr tanlanmagan</div>
        )}
      </div>

      {/* 3. NEURAL GRAPH VISUALIZER */}
      <div className="flex-1 relative bg-[#09090b] overflow-hidden">
        <div className="absolute top-3 left-3 text-[10px] text-[#71717a] tracking-widest uppercase font-mono z-10 bg-[#121215]/80 px-2 py-1 rounded border border-[#27272a]">
          NEURAL VISUALIZER
        </div>

        {/* GRAPH CONTROLS */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 z-10 bg-[#121215] p-1 rounded-lg border border-[#27272a]">
          <button onClick={() => setZoom(z => Math.min(z * 1.2, 3))} className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa]"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.4))} className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa]"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa]"><RefreshCw className="w-4 h-4" /></button>
        </div>

        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />
      </div>

    </div>
  );
}