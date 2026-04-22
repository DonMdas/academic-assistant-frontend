import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { scheduleChat, schedules as schedulesApi } from './index';
import ChunkSourceViewer from './ChunkSourceViewer';
import {
  Send, Brain, Loader2,
  Trash2, ArrowLeft, RefreshCw,
} from 'lucide-react';

function Bubble({ msg, scheduleId }) {
  const isUser = msg.role === 'user';
  const isBuffering = msg.streaming && !msg.content;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center mr-2.5 flex-shrink-0 mt-1">
          <Brain size={15} className="text-indigo-600" />
        </div>
      )}
      <div className="max-w-[72%]">
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

const SUGGESTED = [
  'Summarise the key concepts',
  'What are the most important topics?',
  'Create a quick revision checklist',
  'What should I focus on first?',
];

const PAGE_SIZE = 30;

export default function ScheduleChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const bottomRef = useRef();

  // Load schedule name + chat history
  useEffect(() => {
    schedulesApi.get(id).then(setSchedule).catch(() => {});
    loadHistory(1);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // GET /schedules/{id}/chat/history?limit=...&offset=...
  const loadHistory = async (p) => {
    setLoadingHistory(true);
    try {
      const data = await scheduleChat.history(id, { limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE });
      // Backend may return { messages, total } or similar
      const items = data?.messages || data?.items || [];
      const mapped = items.map((m) => ({
        role: m.role,
        content: m.content,
        sources: m.sources || [],
      }));
      if (p === 1) setMessages([...mapped].reverse());
      else setMessages((prev) => [[...mapped].reverse(), ...prev].flat());
      setHasMore((data?.total || 0) > p * PAGE_SIZE);
      setPage(p);
    } catch { /* ok */ }
    finally { setLoadingHistory(false); }
  };

  // POST /schedules/{id}/chat (SSE)
  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: msg }]);

    const msgId = Date.now();
    setMessages((m) => [...m, { id: msgId, role: 'assistant', content: '', streaming: true, sources: [] }]);
    setStreaming(true);

    let full = '';
    let srcs = [];
    await scheduleChat.send(id, msg, {
      onDelta:   (d) => { full += d; setMessages((m) => m.map((x) => x.id === msgId ? { ...x, content: full } : x)); },
      onSources: (s) => { srcs = s; },
      onDone:    () => { setMessages((m) => m.map((x) => x.id === msgId ? { ...x, streaming: false, sources: srcs } : x)); setStreaming(false); },
      onError:   () => setStreaming(false),
    });
  }, [id, input, streaming]);

  // DELETE /schedules/{id}/chat/history
  const clearHistory = async () => {
    if (!confirm('Clear all chat history for this schedule?')) return;
    try {
      await scheduleChat.clearHistory(id);
      setMessages([]);
      setPage(1);
      setHasMore(false);
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-108px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/schedules/${id}`)}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg text-gray-400 transition-colors"
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Chat</h1>
            <p className="text-sm text-gray-400 dark:text-gray-400">
              {schedule?.name ? `Chatting about: ${schedule.name}` : 'Schedule chat'}
            </p>
          </div>
        </div>
        <button
          onClick={clearHistory}
          className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors"
        >
          <Trash2 size={14} /> Clear history
        </button>
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => loadHistory(page + 1)}
          className="text-xs text-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-2 flex-shrink-0"
        >
          Load older messages
        </button>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-3">
        {loadingHistory && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw size={20} className="animate-spin text-gray-200" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-4">
              <Brain size={28} className="text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Ask anything about your schedule
            </h3>
            <p className="text-sm text-gray-400 dark:text-gray-400 mb-6 max-w-xs">
              Your AI tutor has read all your documents and is ready to help
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-xs bg-gray-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-200 border border-gray-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-400/40 rounded-xl px-3 py-2.5 text-gray-600 dark:text-gray-200 transition-all text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => <Bubble key={msg.id || i} msg={msg} scheduleId={id} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 shadow-sm dark:shadow-none dark:border dark:border-slate-700 flex items-center gap-3 flex-shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask about your study materials…"
          disabled={streaming}
          className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 outline-none placeholder-gray-400 disabled:opacity-50"
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || streaming}
          className="w-9 h-9 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
        >
          {streaming
            ? <Loader2 size={15} className="text-white animate-spin" />
            : <Send size={15} className="text-white" />
          }
        </button>
      </div>
    </div>
  );
}
