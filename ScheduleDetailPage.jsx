import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { schedules as schedulesApi, documents as docsApi, operations } from './index';
import {
  Upload, FileText, Trash2, CheckCircle2, Clock,
  AlertCircle, RefreshCw, MessageSquare, BrainCircuit,
  ChevronRight, ArrowLeft, ChevronDown, ChevronUp,
} from 'lucide-react';

function IngestBadge({ status }) {
  const cfg = {
    pending:    { cls: 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-300',   Icon: Clock,         label: 'Pending' },
    processing: { cls: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300', Icon: RefreshCw,     label: 'Processing', spin: true },
    done:       { cls: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300', Icon: CheckCircle2,  label: 'Ready' },
    failed:     { cls: 'bg-red-100 text-red-500 dark:bg-red-500/15 dark:text-red-300',     Icon: AlertCircle,   label: 'Failed' },
  }[status] || { cls: 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-300', Icon: Clock, label: status };

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${cfg.cls}`}>
      <cfg.Icon size={10} className={cfg.spin ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

function IngestLogTerminal({ logs, open, onToggle }) {
  const bottomRef = useRef();

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, open]);

  return (
    <div className="mb-5">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-2"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? 'Hide' : 'Show'} upload and ingestion logs
      </button>

      {open && (
        <div className="bg-gray-950 dark:bg-slate-950 rounded-2xl p-4 max-h-56 overflow-y-auto font-mono text-xs space-y-0.5">
          {logs.length === 0 && (
            <span className="text-gray-600">Waiting for logs...</span>
          )}
          {logs.map((entry, idx) => {
            const level = typeof entry === 'object' ? String(entry.level || 'info').toLowerCase() : 'info';
            const color = {
              error: 'text-red-400',
              warn: 'text-yellow-400',
              info: 'text-green-400',
              success: 'text-emerald-400',
            }[level] || 'text-green-400';

            const message = typeof entry === 'object' ? (entry.message || JSON.stringify(entry)) : String(entry);
            const metadata = typeof entry === 'object' && entry?.metadata && typeof entry.metadata === 'object'
              ? entry.metadata
              : {};
            const lines = [String(message || '').trim() || '(no message)'];

            const reason = typeof metadata.reason === 'string' ? metadata.reason.trim() : '';
            if (reason) lines.push(`  reason: ${reason}`);

            const reasons = Array.isArray(metadata.reasons) ? metadata.reasons.filter(Boolean) : [];
            if (reasons.length) lines.push(`  reasons: ${reasons.join('; ')}`);

            return (
              <div key={idx} className={color}>
                {lines.map((line, lineIdx) => (
                  <div key={`${idx}-${lineIdx}`}>{line}</div>
                ))}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

export default function ScheduleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [ingestLogs, setIngestLogs] = useState([]);
  const [ingestLogsOpen, setIngestLogsOpen] = useState(false);
  const fileRef = useRef();
  const pollMap = useRef({}); // docId → intervalId
  const opStreamsRef = useRef({}); // opId -> EventSource
  const opLabelsRef = useRef({}); // opId -> filename/label

  const appendLog = useCallback((entry) => {
    setIngestLogs((prev) => [...prev, entry]);
  }, []);

  const closeOperationStream = useCallback((operationId) => {
    const opId = String(operationId || '').trim();
    if (!opId) return;
    const active = opStreamsRef.current[opId];
    if (active) {
      active.close();
      delete opStreamsRef.current[opId];
    }
  }, []);

  const closeAllOperationStreams = useCallback(() => {
    Object.values(opStreamsRef.current).forEach((es) => {
      try { es?.close?.(); } catch { /* ignore */ }
    });
    opStreamsRef.current = {};
  }, []);

  const startOperationStream = useCallback((operationId, label = 'Document') => {
    const opId = String(operationId || '').trim();
    if (!opId || opStreamsRef.current[opId]) return;

    opLabelsRef.current[opId] = label;
    appendLog({ level: 'info', message: `[${label}] Streaming ingestion logs...` });

    opStreamsRef.current[opId] = operations.stream(opId, {
      onMessage: (event, eventName) => {
        const streamLabel = opLabelsRef.current[opId] || label;

        if (eventName === 'log') {
          const message = typeof event?.message === 'string' && event.message.trim()
            ? event.message.trim()
            : JSON.stringify(event || {});
          appendLog({
            level: String(event?.level || 'info').toLowerCase(),
            message: `[${streamLabel}] ${message}`,
          });
          return;
        }

        if (eventName === 'state' && String(event?.status || '').toLowerCase() === 'failed') {
          appendLog({ level: 'error', message: `[${streamLabel}] Ingestion failed.` });
          return;
        }

        if (eventName === 'error') {
          const errText = typeof event?.message === 'string' && event.message.trim()
            ? event.message.trim()
            : 'Operation stream error';
          appendLog({ level: 'error', message: `[${streamLabel}] ${errText}` });
        }
      },
      onDone: () => {
        const streamLabel = opLabelsRef.current[opId] || label;
        appendLog({ level: 'success', message: `[${streamLabel}] Ingestion stream completed.` });
        closeOperationStream(opId);
      },
      onError: () => {
        const streamLabel = opLabelsRef.current[opId] || label;
        appendLog({ level: 'error', message: `[${streamLabel}] Operation stream disconnected.` });
        closeOperationStream(opId);
      },
    });
  }, [appendLog, closeOperationStream]);

  const startStreamingForPendingDocs = useCallback((docList) => {
    (docList || [])
      .filter((doc) => doc.ingest_status === 'pending' || doc.ingest_status === 'processing')
      .forEach((doc) => {
        const operationId = String(doc?.ingest_report?.operation_id || '').trim();
        if (!operationId) return;
        startOperationStream(operationId, doc.filename || doc.id || 'Document');
      });
  }, [startOperationStream]);

  // ── Loaders ─────────────────────────────────────────────────
  const loadSchedule = useCallback(async () => {
    // GET /schedules/{id}
    const data = await schedulesApi.get(id);
    setSchedule(data);
  }, [id]);

  const loadDocs = useCallback(async () => {
    // GET /schedules/{id}/documents
    const data = await docsApi.list(id);
    setDocs(data || []);
    return data || [];
  }, [id]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        await Promise.all([
          loadSchedule(),
          loadDocs().then((docList) => {
            startPollingPending(docList);
            startStreamingForPendingDocs(docList);
          }),
        ]);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    init();
    return () => {
      Object.values(pollMap.current).forEach(clearInterval);
      closeAllOperationStreams();
    };
  }, [id]);

  // ── Ingest polling ───────────────────────────────────────────
  // GET /schedules/{id}/documents/{doc_id}/ingest-status every 3s
  const startPollingPending = useCallback((docList) => {
    (docList || [])
      .filter((d) => d.ingest_status === 'pending' || d.ingest_status === 'processing')
      .forEach(({ id: docId }) => pollDoc(docId));
  }, [id]);

  const pollDoc = (docId) => {
    if (pollMap.current[docId]) return;
    pollMap.current[docId] = setInterval(async () => {
      try {
        const { ingest_status } = await docsApi.ingestStatus(id, docId);
        setDocs((prev) =>
          prev.map((d) => d.id === docId ? { ...d, ingest_status } : d)
        );
        if (ingest_status === 'done' || ingest_status === 'failed') {
          clearInterval(pollMap.current[docId]);
          delete pollMap.current[docId];
        }
      } catch { /* ok */ }
    }, 3000);
  };

  // ── Upload ───────────────────────────────────────────────────
  // POST /schedules/{id}/documents  (multipart)
  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError('');
    setIngestLogsOpen(true);
    try {
      const res = await docsApi.upload(id, Array.from(files));
      const uploadedDocs = Array.isArray(res?.documents) ? res.documents : [];
      const operationIds = Array.isArray(res?.operation_ids) ? res.operation_ids : [];

      if (operationIds.length > 0) {
        appendLog({ level: 'info', message: `Queued ingestion for ${operationIds.length} file(s).` });
      }

      operationIds.forEach((opId, idx) => {
        const fromResult = uploadedDocs[idx]?.filename;
        const fromInput = Array.from(files)[idx]?.name;
        startOperationStream(opId, fromResult || fromInput || `Document ${idx + 1}`);
      });

      // res.documents = newly created docs
      // res.operation_ids = background ingestion op IDs
      const fresh = await loadDocs();
      startPollingPending(fresh);
      startStreamingForPendingDocs(fresh);
    } catch (e) {
      setUploadError(e.message || 'Upload failed');
      appendLog({ level: 'error', message: `Upload failed: ${e.message || 'unknown error'}` });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ── Delete doc ───────────────────────────────────────────────
  // DELETE /schedules/{id}/documents/{doc_id}
  const handleDelete = async (docId) => {
    if (!confirm('Delete this document? Chunks and index will be rebuilt.')) return;
    const deletingDoc = docs.find((d) => d.id === docId);
    const operationId = String(deletingDoc?.ingest_report?.operation_id || '').trim();
    if (operationId) {
      closeOperationStream(operationId);
      delete opLabelsRef.current[operationId];
    }
    clearInterval(pollMap.current[docId]);
    delete pollMap.current[docId];
    try { await docsApi.delete(id, docId); loadDocs(); }
    catch (e) { alert(e.message); }
  };

  const allReady = docs.length > 0 && docs.every((d) => d.ingest_status === 'done');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={22} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => navigate('/schedules')}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4 transition-colors"
      >
        <ArrowLeft size={15} /> Back to Schedules
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{schedule?.name}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-400 mt-0.5">{schedule?.description || 'No description'}</p>
        </div>
        <div className="flex gap-2">
          {/* Chat — POST /schedules/{id}/chat */}
          <button
            onClick={() => navigate(`/schedules/${id}/chat`)}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm dark:shadow-none transition-colors"
          >
            <MessageSquare size={15} className="text-indigo-500" />
            AI Chat
          </button>
          <button
            onClick={() => navigate(`/schedules/${id}/plan`)}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm dark:shadow-none transition-colors"
          >
            <BrainCircuit size={15} className="text-indigo-500" />
            View Plans
          </button>
          {/* Generate plan */}
          <button
            onClick={() => navigate(`/schedules/${id}/plan`)}
            disabled={!allReady}
            title={!allReady ? 'Wait for all documents to finish indexing' : ''}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition-colors"
          >
            <BrainCircuit size={15} />
            Generate Plan
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Documents not ready warning */}
      {docs.length > 0 && !allReady && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-700">
          <RefreshCw size={14} className="animate-spin flex-shrink-0" />
          Documents are still being indexed. The Generate Plan button will unlock when all are ready.
        </div>
      )}

      {/* Upload zone */}
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-2xl py-10 flex flex-col items-center justify-center cursor-pointer transition-colors mb-5 ${
          dragOver
            ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-500'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.docx"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        {uploading ? (
          <>
            <RefreshCw size={26} className="animate-spin text-indigo-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-300">Uploading &amp; queuing for indexing…</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/20 rounded-xl flex items-center justify-center mb-3">
              <Upload size={22} className="text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Drop files here or click to upload</p>
            <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">PDF, TXT, MD, DOCX</p>
          </>
        )}
      </div>

      {uploadError && (
        <p className="text-sm text-red-500 mb-3">{uploadError}</p>
      )}

      <IngestLogTerminal
        logs={ingestLogs}
        open={ingestLogsOpen}
        onToggle={() => setIngestLogsOpen((v) => !v)}
      />

      {/* Documents list */}
      {docs.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-none dark:border dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Documents
              <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-400 font-normal">({docs.length})</span>
            </span>
            {allReady && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 size={12} /> All indexed
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-700">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-8 h-8 bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText size={15} className="text-gray-500 dark:text-gray-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {doc.filename || doc.name || doc.id}
                  </p>
                  {doc.size && (
                    <p className="text-xs text-gray-400 dark:text-gray-400">{(doc.size / 1024).toFixed(1)} KB</p>
                  )}
                </div>
                <IngestBadge status={doc.ingest_status} />
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {docs.length === 0 && !uploading && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-400 py-6">
          Upload documents to enable AI-powered study planning
        </p>
      )}
    </div>
  );
}
