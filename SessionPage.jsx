import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessions as sessionsApi } from './index';
import ChunkSourceViewer from './ChunkSourceViewer';
import {
  Send, CheckCircle2, BookOpen, ChevronRight,
  Brain, Loader2, ArrowLeft, RefreshCw,
} from 'lucide-react';

// ── Chat bubble ───────────────────────────────────────────────
function Bubble({ msg, scheduleId }) {
  const isUser = msg.role === 'user';
  const isBuffering = msg.streaming && !msg.content;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-1">
          <Brain size={14} className="text-indigo-600" />
        </div>
      )}
      <div className="max-w-[75%]">
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-gray-900 text-white rounded-tr-sm'
              : 'bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-gray-800 dark:text-gray-100 rounded-tl-sm shadow-sm dark:shadow-none'
          }`}
        >
          {isBuffering && (
            <span className="text-gray-400 dark:text-gray-500 italic">
              Hold on bro...
            </span>
          )}
          <span className="whitespace-pre-wrap">{msg.content}</span>
          {msg.streaming && (
            <span className="inline-block w-1 h-4 bg-indigo-400 ml-1 animate-pulse align-middle" />
          )}
        </div>
        {msg.sources?.length > 0 && <ChunkSourceViewer scheduleId={scheduleId} sources={msg.sources} />}
      </div>
    </div>
  );
}

export default function SessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [sidebar, setSidebar] = useState(null);
  const [briefing, setBriefing] = useState('');
  const [briefingDone, setBriefingDone] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const esRef = useRef(null);
  const bottomRef = useRef();
  const focusTopics = Array.isArray(session?.focus_topics)
    ? session.focus_topics
    : Array.isArray(session?.focus_chunks)
      ? session.focus_chunks.map((chunk) => chunk?.topic).filter(Boolean)
      : [];

  // ── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        // GET /sessions/{id}/sidebar
        const [sideData, histData] = await Promise.allSettled([
          sessionsApi.sidebar(id),
          sessionsApi.chatHistory(id),
        ]);
        if (sideData.status === 'fulfilled') setSidebar(sideData.value);

        // Load existing chat history
        if (histData.status === 'fulfilled') {
          const msgs = (histData.value?.messages || histData.value || []).map((m) => ({
            role: m.role,
            content: m.content,
            sources: m.sources || [],
          }));
          setMessages(msgs);
          if (msgs.length > 0) setBriefingDone(true); // already studied before
        }

        // POST /sessions/{id}/start
        const startData = await sessionsApi.start(id);
        // Extract session info from start response if returned
        if (startData?.session) setSession(startData.session);
        else if (startData?.id) setSession(startData);

        // GET /sessions/{id}/briefing/stream (EventSource)
        if (!briefingDone) {
          esRef.current = sessionsApi.briefingStream(id, {
            onDelta: (chunk) => setBriefing((b) => b + chunk),
            onDone: () => { setBriefingDone(true); esRef.current = null; },
            onError: () => { setBriefingDone(true); esRef.current = null; },
          });
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    init();
    return () => esRef.current?.close();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, briefing]);

  // ── Send message ─────────────────────────────────────────────
  // POST /sessions/{id}/chat — SSE stream
  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);

    const msgId = Date.now();
    setMessages((m) => [...m, { id: msgId, role: 'assistant', content: '', streaming: true, sources: [] }]);
    setStreaming(true);

    let full = '';
    let srcs = [];
    await sessionsApi.chat(id, text, {
      onDelta:   (d) => { full += d; setMessages((m) => m.map((x) => x.id === msgId ? { ...x, content: full } : x)); },
      onSources: (s) => { srcs = s; },
      onDone:    () => { setMessages((m) => m.map((x) => x.id === msgId ? { ...x, streaming: false, sources: srcs } : x)); setStreaming(false); },
      onError:   () => setStreaming(false),
    });
  }, [id, input, streaming]);

  // ── Complete session ─────────────────────────────────────────
  // POST /sessions/{id}/complete
  const handleComplete = async () => {
    setCompleting(true);
    try {
      await sessionsApi.complete(id);
      navigate('/dashboard');
    } catch (e) {
      alert(e.message);
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={22} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-108px)]">
      {/* ── Main ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Session header */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl px-5 py-3.5 mb-3 shadow-sm dark:shadow-none dark:border dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 flex-shrink-0"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-sm truncate">
                {session?.title || `Session ${id.slice(0, 8)}`}
              </h1>
              {focusTopics.length > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-400 truncate">
                  {focusTopics.join(' · ')}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleComplete}
            disabled={completing}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white rounded-xl px-4 py-2 text-xs font-semibold transition-colors shadow-sm flex-shrink-0 ml-3"
          >
            {completing
              ? <Loader2 size={13} className="animate-spin" />
              : <CheckCircle2 size={13} />
            }
            Complete Session
          </button>
        </div>

        {/* Briefing card — shown while streaming and after if not empty */}
        {briefing && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 mb-3 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={15} className="text-indigo-600" />
              <span className="text-xs font-semibold text-indigo-700">Session Briefing</span>
              {!briefingDone && <Loader2 size={12} className="animate-spin text-indigo-400 ml-auto" />}
            </div>
            <p className="text-sm text-indigo-800 leading-relaxed whitespace-pre-wrap">{briefing}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 mb-3">
            {error}
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-3">
          {messages.length === 0 && briefingDone && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-400 text-center">
              <Brain size={32} className="mb-3 opacity-25" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-200">Ask anything about this session's topics</p>
              <p className="text-xs mt-1">Your AI tutor retrieves answers from your uploaded documents</p>
            </div>
          )}
          {messages.map((msg, i) => <Bubble key={msg.id || i} msg={msg} scheduleId={session?.schedule_id} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 shadow-sm dark:shadow-none dark:border dark:border-slate-700 flex items-center gap-3 flex-shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={briefingDone ? 'Ask your AI tutor…' : 'Waiting for briefing…'}
            disabled={streaming || !briefingDone}
            className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 outline-none placeholder-gray-400 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming || !briefingDone}
            className="w-9 h-9 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
          >
            {streaming
              ? <Loader2 size={15} className="text-white animate-spin" />
              : <Send size={15} className="text-white" />
            }
          </button>
        </div>
      </div>

      {/* ── Sidebar ──────────────────────────────────────────── */}
      {/* GET /sessions/{id}/sidebar → { prerequisites, upcoming_sessions } */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3">
        {/* Prerequisites */}
        {sidebar?.prerequisites?.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-none dark:border dark:border-slate-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Prerequisites</h3>
            <div className="space-y-2">
              {sidebar.prerequisites.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <CheckCircle2 size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>{typeof p === 'string' ? p : p.title || JSON.stringify(p)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming sessions */}
        {sidebar?.upcoming_sessions?.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-none dark:border dark:border-slate-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Up Next</h3>
            <div className="space-y-1">
              {sidebar.upcoming_sessions.slice(0, 5).map((s, i) => (
                <button
                  key={i}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                  className="w-full flex items-center justify-between text-left px-2 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-indigo-400 flex-shrink-0 transition-colors" />
                    <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{s.title}</span>
                  </div>
                  <ChevronRight size={11} className="text-gray-300 group-hover:text-indigo-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Focus topics from session */}
        {focusTopics.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-none dark:border dark:border-slate-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Focus Topics</h3>
            <div className="space-y-2">
              {focusTopics.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-200">
                  <BookOpen size={11} className="text-indigo-400 flex-shrink-0" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
