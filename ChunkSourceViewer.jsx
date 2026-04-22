import { useState } from 'react';
import { BookOpen, ChevronRight, ExternalLink, Loader2, X } from 'lucide-react';
import { documents as documentsApi } from './index';

function formatPages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return '';
  const compact = pages
    .map((page) => String(page).trim())
    .filter(Boolean)
    .slice(0, 4);
  return compact.length > 0 ? `Pages ${compact.join(', ')}` : '';
}

function ChunkCard({ source, index, loading, onClick }) {
  const title = source?.topic || source?.title || source?.filename || `Chunk ${index + 1}`;
  const score = typeof source?.score === 'number' ? source.score : source?.retrieval?.score;
  const pages = formatPages(source?.pages);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full text-left rounded-2xl border border-indigo-100 dark:border-indigo-400/20 bg-indigo-50/70 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 transition-colors px-3 py-3 group disabled:opacity-60"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <BookOpen size={14} className="text-indigo-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              {title}
            </p>
            <ChevronRight size={13} className="text-indigo-300 group-hover:text-indigo-500 flex-shrink-0 mt-0.5" />
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-300 mt-0.5 truncate">
            {source?.filename || source?.chunk_id || 'Relevant chunk'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-indigo-600 dark:text-indigo-300">
            {pages && <span className="bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-400/20 px-2 py-0.5 rounded-full">{pages}</span>}
            {typeof score === 'number' && (
              <span className="bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-400/20 px-2 py-0.5 rounded-full">
                Score {score.toFixed(2)}
              </span>
            )}
            {source?.chunk_id && (
              <span className="bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-400/20 px-2 py-0.5 rounded-full truncate max-w-[10rem]">
                {source.chunk_id}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function ChunkModal({ chunk, error, loading, onClose }) {
  if (!chunk && !loading && !error) return null;

  const metadata = chunk?.metadata || {};
  const focusPoints = Array.isArray(metadata.focus_points) ? metadata.focus_points : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4 py-6">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-indigo-500 font-semibold">
              <ExternalLink size={12} />
              Chunk Preview
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50 mt-1 truncate">
              {chunk?.metadata?.topic || chunk?.filename || chunk?.id || 'Chunk'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
              {chunk?.filename || 'Unknown source'}{chunk?.id ? ` · ${chunk.id}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center justify-center text-gray-500 dark:text-gray-300 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
              <Loader2 size={14} className="animate-spin" />
              Loading chunk...
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          {chunk && !loading && !error && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-2xl bg-gray-50 dark:bg-slate-800 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold">Document</p>
                  <p className="text-gray-800 dark:text-gray-100 mt-1 break-words">{chunk.filename || 'Unknown'}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-slate-800 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold">Chunk ID</p>
                  <p className="text-gray-800 dark:text-gray-100 mt-1 break-all">{chunk.id}</p>
                </div>
              </div>

              {focusPoints.length > 0 && (
                <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-400/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold mb-2">Focus Points</p>
                  <div className="flex flex-wrap gap-2">
                    {focusPoints.map((point, index) => (
                      <span
                        key={index}
                        className="text-xs rounded-full px-3 py-1 bg-white/80 dark:bg-slate-900/70 border border-indigo-100 dark:border-indigo-400/20 text-gray-700 dark:text-gray-100"
                      >
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-4">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold mb-3">Full Chunk</p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800 dark:text-gray-100 m-0">
                  {chunk.content || 'No content available for this chunk.'}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChunkSourceViewer({ scheduleId, sources = [] }) {
  const [selectedChunk, setSelectedChunk] = useState(null);
  const [loadingChunkId, setLoadingChunkId] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  if (!Array.isArray(sources) || sources.length === 0) return null;

  const openChunk = async (source) => {
    const chunkId = String(source?.chunk_id || source?.legacy_chunk_id || '').trim();
    if (!scheduleId) {
      setError('Session data is still loading. Try again in a moment.');
      return;
    }
    if (!chunkId) {
      setError('This source does not include a chunk ID.');
      return;
    }

    setError('');
    setLoadingChunkId(chunkId);
    try {
      const chunk = await documentsApi.getChunk(scheduleId, chunkId);
      setSelectedChunk(chunk);
    } catch (err) {
      setError(err?.message || 'Failed to load chunk.');
    } finally {
      setLoadingChunkId('');
    }
  };

  return (
    <>
      <div className="mt-2 px-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="w-full flex items-center justify-between text-left rounded-2xl border border-indigo-100 dark:border-indigo-400/20 bg-indigo-50/50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 px-3 py-2.5 transition-colors"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Relevant chunks</p>
            <p className="text-xs text-gray-500 dark:text-gray-300">{sources.length} source{sources.length === 1 ? '' : 's'}</p>
          </div>
          <ChevronRight size={14} className={`text-indigo-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>

        {open && (
          <div className="mt-2 space-y-2">
            {sources.map((source, index) => {
              const chunkId = String(source?.chunk_id || source?.legacy_chunk_id || '').trim();
              const loading = loadingChunkId === chunkId;
              return (
                <ChunkCard
                  key={`${chunkId || 'source'}-${index}`}
                  source={source}
                  index={index}
                  loading={loading}
                  onClick={() => openChunk(source)}
                />
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 px-1 text-xs text-red-500 dark:text-red-400">
          {error}
        </p>
      )}

      {selectedChunk && (
        <ChunkModal
          chunk={selectedChunk}
          error={error}
          loading={false}
          onClose={() => setSelectedChunk(null)}
        />
      )}
    </>
  );
}