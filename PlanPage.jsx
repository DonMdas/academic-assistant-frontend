import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { plan as planApi, operations, auth } from './index';
import { connectCalendarWithPopup } from './calendarConnect';
import {
  BrainCircuit, CheckCircle2, RefreshCw, Calendar,
  Send, ChevronDown, ChevronUp, Zap, RotateCcw,
  ArrowLeft, Trash2, AlertCircle, CalendarX2,
  MessageSquare, X,
} from 'lucide-react';

function formatPlanTimestamp(value) {
  if (!value) return 'Unknown time';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isPlanSynced(plan) {
  return Boolean((plan?.sessions || []).some((session) => {
    const eventId = String(session?.calendar_event_id || '').trim();
    const status = String(session?.calendar_status || '').trim().toLowerCase();
    return Boolean(eventId) || status === 'created';
  }));
}

function isCalendarNotConnectedError(message) {
  const value = String(message || '').toLowerCase();
  return value.includes('google calendar is not connected') || value.includes('not connected for this user');
}

function getVisibleSessionsForPlan(plan, materializedSessions) {
  if (!plan) return [];
  if (plan.status === 'active' && Array.isArray(materializedSessions) && materializedSessions.length > 0) {
    return materializedSessions;
  }
  return Array.isArray(plan.sessions) ? plan.sessions : [];
}

function normalizeQwenFeedback(source) {
  const payload = source || {};
  const strengths = Array.isArray(payload?.strengths) ? payload.strengths.filter(Boolean) : [];
  const risks = Array.isArray(payload?.risks) ? payload.risks.filter(Boolean) : [];
  const suggestedAdjustments = Array.isArray(payload?.suggested_adjustments)
    ? payload.suggested_adjustments.filter(Boolean)
    : [];

  const severityRaw = Number(payload?.severity);
  const severity = Number.isFinite(severityRaw) ? Math.max(0, Math.min(3, Math.trunc(severityRaw))) : null;
  const approvalReady = typeof payload?.approval_ready === 'boolean' ? payload.approval_ready : null;
  const summary = typeof payload?.summary === 'string' ? payload.summary.trim() : '';

  return {
    summary,
    strengths,
    risks,
    suggestedAdjustments,
    severity,
    approvalReady,
    hasContent: Boolean(summary || strengths.length || risks.length || suggestedAdjustments.length || severity !== null),
  };
}

function normalizeQwenReview(plan) {
  const source = plan?.review?.qwen_feedback
    || plan?.constraints?.qwen_feedback
    || plan?.constraints?.model_notes?.qwen
    || {};

  return normalizeQwenFeedback(source);
}

function getQwenReviewHistory(plan) {
  const history = plan?.constraints?.model_notes?.qwen_feedback_history;
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => normalizeQwenFeedback(entry))
    .filter((entry) => entry.hasContent);
}

function resolvePlannerPrompt(plan) {
  const review = plan?.review || {};
  const constraints = plan?.constraints || {};

  const clarificationQuestion = String(
    review?.clarification_question
      || constraints?.clarification_question
      || constraints?.model_notes?.clarification_question
      || '',
  ).trim();

  const feedbackPrompt = String(
    review?.feedback_prompt
      || constraints?.feedback_prompt
      || '',
  ).trim();

  const prompt = clarificationQuestion || feedbackPrompt;
  const isClarification = Boolean(clarificationQuestion)
    || Boolean(review?.clarification_requested)
    || String(review?.feedback_source || '').trim().toLowerCase() === 'gemma_clarification';

  return {
    prompt,
    isClarification,
  };
}

function qwenSeverityLabel(severity) {
  if (severity === 0) return 'Excellent';
  if (severity === 1) return 'Minor issues';
  if (severity === 2) return 'Major issues';
  if (severity === 3) return 'Critical';
  return 'Unknown';
}

function qwenSeverityClasses(severity) {
  if (severity === 0) return 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300';
  if (severity === 1) return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300';
  if (severity === 2) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
  if (severity === 3) return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300';
  return 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300';
}

function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { level: 'info', lines: [String(entry ?? '')] };
  }

  const message = entry.message || JSON.stringify(entry);
  const level = String(entry.level || 'info').toLowerCase();
  const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};

  const lines = [String(message || '').trim() || '(no message)'];
  const reason = typeof metadata.reason === 'string' ? metadata.reason.trim() : '';
  if (reason) lines.push(`  reason: ${reason}`);

  const reasons = Array.isArray(metadata.reasons) ? metadata.reasons.filter(Boolean) : [];
  if (reasons.length) lines.push(`  reasons: ${reasons.join('; ')}`);

  return { level, lines };
}

function LogTerminal({ logs, open, onToggle }) {
  const bottomRef = useRef();
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, open]);

  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-2"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? 'Hide' : 'Show'} operation logs
      </button>
      {open && (
        <div className="bg-gray-950 dark:bg-slate-950 rounded-2xl p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
          {logs.length === 0 && (
            <span className="text-gray-600">Waiting for logs...</span>
          )}
          {logs.map((l, i) => {
            const normalized = normalizeLogEntry(l);
            const color = { error: 'text-red-400', warn: 'text-yellow-400', info: 'text-green-400', success: 'text-emerald-400' }[normalized.level] || 'text-green-400';
            return (
              <div key={i} className={color}>
                {normalized.lines.map((line, idx) => (
                  <div key={`${i}-${idx}`}>{line}</div>
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

function SessionItem({ session, index, onOpen }) {
  const startRaw = session.date_time || session.start_time || session.starts_at || session.scheduled_at || null;
  const endRaw = session.end_time || session.ends_at || null;
  const dateTimeLabel = startRaw
    ? (() => {
        const start = new Date(startRaw);
        const end = endRaw ? new Date(endRaw) : null;
        if (Number.isNaN(start.getTime())) return String(startRaw);

        const datePart = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        const startPart = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        if (!end || Number.isNaN(end.getTime())) return `${datePart}, ${startPart}`;
        const endPart = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return `${datePart}, ${startPart} - ${endPart}`;
      })()
    : null;

  const focusTopics = Array.isArray(session.focus_topics)
    ? session.focus_topics
    : Array.isArray(session.topics)
      ? session.topics
      : [];

  const prerequisites = Array.isArray(session.prerequisites)
    ? session.prerequisites
    : Array.isArray(session.prereqs)
      ? session.prereqs
      : [];

  const calendarStatus = String(session.calendar_status || '').trim();

  return (
    <button
      type="button"
      onClick={() => onOpen?.(session)}
      className="w-full text-left flex items-start justify-between gap-3 bg-gray-50 dark:bg-slate-700 rounded-xl px-4 py-3 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
    >
      <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-bold text-indigo-600">{index + 1}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{session.title || session.topic || session.name}</p>
        {dateTimeLabel && (
          <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5">Date/Time: {dateTimeLabel}</p>
        )}
        {focusTopics.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">
            Focus Topics: {focusTopics.join(', ')}
          </p>
        )}
        {prerequisites.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">Prerequisites: {prerequisites.join(', ')}</p>
        )}
        {calendarStatus && (
          <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">Calendar: {calendarStatus}</p>
        )}
      </div>
      <span className="text-xs text-indigo-500 font-medium flex-shrink-0 self-center">View details</span>
    </button>
  );
}

export default function PlanPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('idle');
  const [planData, setPlanData] = useState(null);
  const [allPlans, setAllPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [constraints, setConstraints] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [calendarUnsyncing, setCalendarUnsyncing] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [sessionDetailError, setSessionDetailError] = useState('');
  const esRef = useRef(null);
  const activeOpIdRef = useRef(null);

  const selectedPlan = allPlans.find((plan) => plan.id === selectedPlanId) || planData || null;
  const visibleSessions = getVisibleSessionsForPlan(selectedPlan, sessions);
  const selectedPlanSynced = isPlanSynced(selectedPlan);
  const selectedPlanIsConfirmed = selectedPlan?.status === 'active';
  const qwenReview = normalizeQwenReview(selectedPlan);
  const qwenReviewHistory = getQwenReviewHistory(selectedPlan);
  const plannerPrompt = resolvePlannerPrompt(selectedPlan);

  const closeActiveStream = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    activeOpIdRef.current = null;
  }, []);

  const refreshPlanAndSessions = useCallback(async ({ preferLatest = false } = {}) => {
    const [currentPlan, plans, sess] = await Promise.all([
      planApi.get(id).catch(() => null),
      planApi.listAll(id).catch(() => []),
      planApi.sessions(id).catch(() => []),
    ]);

    const normalizedPlans = Array.isArray(plans) ? plans : [];
    setPlanData(currentPlan || null);
    setAllPlans(normalizedPlans);
    setSessions(Array.isArray(sess) ? sess : []);

    setSelectedPlanId((prev) => {
      if (preferLatest) {
        if (currentPlan?.id) return currentPlan.id;
        return normalizedPlans[0]?.id || null;
      }

      if (prev && normalizedPlans.some((plan) => plan.id === prev)) return prev;
      if (currentPlan?.id && normalizedPlans.some((plan) => plan.id === currentPlan.id)) return currentPlan.id;
      return normalizedPlans[0]?.id || currentPlan?.id || null;
    });

    return {
      currentPlan: currentPlan || null,
      plans: normalizedPlans,
      sessions: Array.isArray(sess) ? sess : [],
    };
  }, [id]);

  const streamOperation = useCallback((operationId, successText) => {
    activeOpIdRef.current = operationId;
    esRef.current = operations.stream(operationId, {
      onMessage: (event, eventName) => {
        if (activeOpIdRef.current !== operationId) return;
        if (eventName === 'log') {
          setLogs((l) => [...l, event]);
          return;
        }
        if (eventName === 'state') {
          const state = String(event?.status || '').toLowerCase();
          if (state === 'failed') {
            setErrorMsg('Plan operation failed. Check operation logs for details.');
            setPhase('error');
          }
          return;
        }
        if (eventName === 'error') {
          const message = typeof event?.message === 'string' && event.message.trim()
            ? event.message.trim()
            : 'Operation stream error';
          setLogs((l) => [...l, { level: 'error', message }]);
        }
      },
      onDone: async () => {
        if (activeOpIdRef.current !== operationId) return;
        closeActiveStream();
        try {
          const refreshed = await refreshPlanAndSessions({ preferLatest: true });
          const hasPlans = (refreshed.plans || []).length > 0 || Boolean(refreshed.currentPlan?.id);
          setPhase(hasPlans ? 'review' : 'idle');
          setFeedback('');
          if (successText) {
            setLogs((l) => [...l, { level: 'success', message: successText }]);
          }
        } catch (e) {
          setErrorMsg('Plan operation finished but latest output could not be loaded: ' + e.message);
          setPhase('error');
        }
      },
      onError: () => {
        if (activeOpIdRef.current !== operationId) return;
        setErrorMsg('Operation stream disconnected. Check logs or try again.');
        setPhase('error');
      },
    });
  }, [closeActiveStream, refreshPlanAndSessions]);

  useEffect(() => {
    (async () => {
      try {
        const refreshed = await refreshPlanAndSessions();
        const hasDraft = Boolean(refreshed.currentPlan?.id);
        const hasAnyPlans = Array.isArray(refreshed.plans) && refreshed.plans.length > 0;
        const hasMaterializedSessions = Array.isArray(refreshed.sessions) && refreshed.sessions.length > 0;
        if (hasDraft || hasAnyPlans || hasMaterializedSessions) {
          setPhase('review');
        }
      } catch {
        /* no plan yet */
      }
    })();
    return () => closeActiveStream();
  }, [closeActiveStream, refreshPlanAndSessions]);

  const generate = async () => {
    if (startDate && endDate && endDate < startDate) {
      setErrorMsg('End date must be on or after the start date.');
      setPhase('error');
      return;
    }
    setPhase('generating');
    setLogs([]);
    setErrorMsg('');
    setLogsOpen(true);
    closeActiveStream();

    try {
      // AFTER
    // BEFORE
    const body = {
      constraints: {
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
      },
      user_feedback: constraints.trim(),
      feedback_history: constraints.trim() ? [constraints.trim()] : [],
    };
      const { operation_id: operationId } = await planApi.generateAsync(id, body);
      streamOperation(operationId, 'Plan generation completed');
    } catch (e) {
      setErrorMsg(e.message);
      setPhase('error');
    }
  };

  const handleRevise = async () => {
    if (!feedback.trim()) return;
    setPhase('generating');
    setLogs([]);
    setErrorMsg('');
    setLogsOpen(true);
    closeActiveStream();

    try {
      const { operation_id: operationId } = await planApi.reviseAsync(id, {
        plan_id: selectedPlan?.id || undefined,
        feedback: feedback.trim(),
      });
      streamOperation(operationId, 'Plan revision completed');
    } catch (e) {
      setErrorMsg(e.message);
      setPhase('error');
    }
  };

  const handleConfirm = async () => {
    if (!selectedPlan?.id || selectedPlan?.status === 'active') return;
    setPhase('confirming');
    try {
      await planApi.confirm(id, { plan_id: selectedPlan.id });
      await refreshPlanAndSessions();
      setPhase('done');
    } catch (e) {
      setErrorMsg(e.message);
      setPhase('error');
    }
  };

  const handleSyncCalendar = async () => {
    if (!selectedPlan?.id) return;
    setCalendarSyncing(true);
    try {
      await planApi.syncCalendar(id, { plan_id: selectedPlan.id });
      await refreshPlanAndSessions();
      alert('Plan synced to Google Calendar.');
    } catch (e) {
      if (isCalendarNotConnectedError(e.message)) {
        const shouldConnect = confirm('Google Calendar is not connected. Connect now and retry sync?');
        if (!shouldConnect) {
          alert('Calendar sync failed: ' + e.message);
          return;
        }

        try {
          await connectCalendarWithPopup(auth);
          await planApi.syncCalendar(id, { plan_id: selectedPlan.id });
          await refreshPlanAndSessions();
          alert('Google Calendar connected and plan synced successfully.');
          return;
        } catch (connectError) {
          alert('Calendar connect/sync failed: ' + connectError.message);
          return;
        }
      }

      alert('Calendar sync failed: ' + e.message);
    } finally {
      setCalendarSyncing(false);
    }
  };

  const handleUnsyncCalendar = async () => {
    if (!selectedPlan?.id) return;
    setCalendarUnsyncing(true);
    try {
      await planApi.unsyncCalendar(id, { plan_id: selectedPlan.id });
      await refreshPlanAndSessions();
      alert('Calendar events removed for this plan.');
    } catch (e) {
      alert('Calendar unsync failed: ' + e.message);
    } finally {
      setCalendarUnsyncing(false);
    }
  };

  const handleDeletePlan = async (planId) => {
    const targetPlan = allPlans.find((plan) => plan.id === planId);
    if (!targetPlan) return;

    if (isPlanSynced(targetPlan)) {
      alert("Can't delete a plan that is already synced to Google Calendar. Unsync it first.");
      return;
    }

    if (!confirm('Delete this plan?')) return;
    setDeletingPlanId(planId);
    try {
      closeActiveStream();
      await planApi.deletePlan(id, planId);
      const refreshed = await refreshPlanAndSessions();
      const hasPlans = (refreshed.plans || []).length > 0 || Boolean(refreshed.currentPlan?.id);
      setPhase(hasPlans ? 'review' : 'idle');
    } catch (e) {
      alert(e.message);
    } finally {
      setDeletingPlanId('');
    }
  };

  const handleDeleteAll = async () => {
    const hasSyncedPlan = allPlans.some((plan) => isPlanSynced(plan));
    if (hasSyncedPlan) {
      alert("Can't delete plans while one is synced to Google Calendar. Unsync the synced plan first.");
      return;
    }
    if (!confirm('Delete all plans for this schedule?')) return;
    try {
      closeActiveStream();
      await planApi.deleteAll(id);
      setPlanData(null);
      setAllPlans([]);
      setSelectedPlanId(null);
      setSessions([]);
      setPhase('idle');
    } catch (e) {
      alert(e.message);
    }
  };

  const openSessionDetails = async (session) => {
    setSelectedSession(session || null);
    setSessionDetailError('');

    const sessionId = String(session?.id || '').trim();
    if (!sessionId) return;

    setSessionDetailLoading(true);
    try {
      const detail = await planApi.session(id, sessionId);
      setSelectedSession((prev) => {
        if (!prev || String(prev.id || '') !== sessionId) return prev;
        return { ...prev, ...(detail || {}) };
      });
    } catch (e) {
      setSessionDetailError(e.message || 'Unable to load full session details.');
    } finally {
      setSessionDetailLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => navigate(`/schedules/${id}`)}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4 transition-colors"
      >
        <ArrowLeft size={15} /> Back to Schedule
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Study Plan</h1>
          <p className="text-sm text-gray-400 dark:text-gray-400">Review every saved plan, manage calendar sync, and confirm the one you want.</p>
        </div>
        {phase === 'review' && allPlans.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors"
          >
            <Trash2 size={14} /> Delete All Plans
          </button>
        )}
      </div>

      {phase === 'idle' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm dark:shadow-none dark:border dark:border-slate-700 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BrainCircuit size={30} className="text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Generate Your Study Plan</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Our AI analyses your uploaded and indexed documents and creates a personalised plan with sessions.
          </p>
          <div className="grid grid-cols-1 gap-3 mb-4 text-left">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <textarea
            placeholder="Any constraints? e.g. 'Focus only on ML chapters' or 'Max 2 hours per day'"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-200 mb-4 text-left"
          />
          <button
            onClick={generate}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Zap size={16} /> Generate Plan
          </button>
        </div>
      )}

      {phase === 'generating' && (
        <div className="max-w-2xl">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
              <BrainCircuit size={20} className="text-indigo-400 animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Generating your plan...</p>
              <p className="text-xs text-gray-400 dark:text-gray-400">Analysing documents and building session structure</p>
            </div>
            <RefreshCw size={18} className="animate-spin text-gray-300" />
          </div>
          <LogTerminal logs={logs} open={logsOpen} onToggle={() => setLogsOpen((o) => !o)} />
        </div>
      )}

      {phase === 'review' && (
        <div className="grid gap-4 lg:grid-cols-[320px,minmax(0,1fr)]">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-none dark:border dark:border-slate-700 overflow-hidden h-fit">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <p className="font-semibold text-gray-800 dark:text-gray-100">
                Existing Plans
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-400 font-normal">({allPlans.length})</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">Select a plan to view sessions, sync status, or delete it.</p>
            </div>
            <div className="p-3 space-y-3">
              {allPlans.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-400 px-2 py-3">No plans yet.</p>
              )}
              {allPlans.map((plan) => {
                const synced = isPlanSynced(plan);
                const isSelected = plan.id === selectedPlan?.id;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors ${
                      isSelected
                        ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/60 dark:bg-indigo-500/10'
                        : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Plan {plan.version || ''}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">{formatPlanTimestamp(plan.updated_at || plan.created_at)}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                        plan.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                      }`}>
                        {plan.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-xs">
                      <span className="text-gray-500 dark:text-gray-300">{plan.session_count || 0} sessions</span>
                      <span className={`px-2 py-1 rounded-full ${
                        synced
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-300'
                      }`}>
                        {synced ? 'Synced' : 'Not synced'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-w-3xl">
            {selectedPlan && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-base">Selected Plan</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Updated {formatPlanTimestamp(selectedPlan.updated_at || selectedPlan.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSyncCalendar}
                      disabled={calendarSyncing || calendarUnsyncing}
                      className="flex items-center gap-2 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl px-4 py-2.5 text-sm font-medium dark:text-gray-100 transition-colors"
                    >
                      {calendarSyncing
                        ? <RefreshCw size={14} className="animate-spin" />
                        : <Calendar size={14} className="text-indigo-500" />
                      }
                      Sync Calendar
                    </button>
                    <button
                      onClick={handleUnsyncCalendar}
                      disabled={!selectedPlanSynced || calendarSyncing || calendarUnsyncing}
                      className="flex items-center gap-2 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl px-4 py-2.5 text-sm font-medium dark:text-gray-100 transition-colors"
                    >
                      {calendarUnsyncing
                        ? <RefreshCw size={14} className="animate-spin" />
                        : <CalendarX2 size={14} className="text-amber-500" />
                      }
                      Unsync Calendar
                    </button>
                    <button
                      onClick={() => handleDeletePlan(selectedPlan.id)}
                      disabled={selectedPlanSynced || deletingPlanId === selectedPlan.id}
                      title={selectedPlanSynced ? "Can't delete a synced plan. Unsync it first." : ''}
                      className="flex items-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
                    >
                      {deletingPlanId === selectedPlan.id ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Delete Plan
                    </button>
                  </div>
                </div>
                {selectedPlanSynced && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
                    This plan is already synced to Google Calendar. You must unsync it before deleting it.
                  </div>
                )}
              </div>
            )}

            {visibleSessions.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-4 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    Sessions
                    <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-400 font-normal">({visibleSessions.length})</span>
                  </span>
                </div>
                <div className="p-4 space-y-2">
                  {visibleSessions.map((s, i) => (
                    <SessionItem
                      key={s.id || s.slot_id || i}
                      session={s}
                      index={i}
                      onOpen={openSessionDetails}
                    />
                  ))}
                </div>
              </div>
            )}

            {plannerPrompt.prompt && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4">
                <h3 className="font-semibold text-amber-800 mb-2 text-sm">
                  {plannerPrompt.isClarification ? 'Planner Clarification Needed' : 'Planner Feedback Needed'}
                </h3>
                <p className="text-sm text-amber-700">{plannerPrompt.prompt}</p>
              </div>
            )}

            {qwenReview.hasContent && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Qwen Plan Review</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {qwenReview.severity !== null && (
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${qwenSeverityClasses(qwenReview.severity)}`}>
                        Severity {qwenReview.severity}: {qwenSeverityLabel(qwenReview.severity)}
                      </span>
                    )}
                    {qwenReview.approvalReady !== null && (
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                          qwenReview.approvalReady
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                        }`}
                      >
                        {qwenReview.approvalReady ? 'Approval Ready' : 'Needs Revision'}
                      </span>
                    )}
                  </div>
                </div>

                {qwenReview.summary && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{qwenReview.summary}</p>
                )}

                {qwenReview.strengths.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300 mb-1.5">Strengths</p>
                    <ul className="list-disc ml-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {qwenReview.strengths.map((item, idx) => <li key={`strength-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                )}

                {qwenReview.risks.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1.5">Risks</p>
                    <ul className="list-disc ml-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {qwenReview.risks.map((item, idx) => <li key={`risk-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                )}

                {qwenReview.suggestedAdjustments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 mb-1.5">Suggested Adjustments</p>
                    <ul className="list-disc ml-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {qwenReview.suggestedAdjustments.map((item, idx) => <li key={`adjust-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {qwenReviewHistory.length > 1 && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm mb-3">Qwen Review History</h3>
                <div className="space-y-3">
                  {qwenReviewHistory.map((entry, idx) => (
                    <div key={`qwen-history-${idx}`} className="border border-gray-100 dark:border-slate-700 rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Pass {idx + 1}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          {entry.severity !== null && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${qwenSeverityClasses(entry.severity)}`}>
                              Severity {entry.severity}
                            </span>
                          )}
                          {entry.approvalReady !== null && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${entry.approvalReady ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>
                              {entry.approvalReady ? 'Approval Ready' : 'Needs Revision'}
                            </span>
                          )}
                        </div>
                      </div>
                      {entry.summary && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">{entry.summary}</p>
                      )}
                      {entry.risks.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">Risks</p>
                          <ul className="list-disc ml-4 text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                            {entry.risks.map((item, riskIdx) => <li key={`risk-${idx}-${riskIdx}`}>{item}</li>)}
                          </ul>
                        </div>
                      )}
                      {entry.suggestedAdjustments.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 mb-1">Suggested Adjustments</p>
                          <ul className="list-disc ml-4 text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                            {entry.suggestedAdjustments.map((item, adjIdx) => <li key={`adj-${idx}-${adjIdx}`}>{item}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedPlan?.constraints?.coverage && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2 text-sm">Coverage</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  Covered {selectedPlan.constraints.coverage.covered_chunks || 0} of {selectedPlan.constraints.coverage.total_chunks || 0} chunks.
                </p>
              </div>
            )}

            <LogTerminal logs={logs} open={logsOpen} onToggle={() => setLogsOpen((o) => !o)} />

            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none dark:border dark:border-slate-700 mb-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3 text-sm">Revise Selected Plan</h3>
              <div className="flex gap-2">
                <input
                  placeholder="e.g. Add more practice sessions, skip chapter 5..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRevise()}
                  className="flex-1 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  onClick={handleRevise}
                  disabled={!feedback.trim() || !selectedPlan?.id}
                  className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
                >
                  <Send size={14} /> Revise
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPhase('idle')}
                className="flex items-center gap-2 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl px-5 py-3 text-sm font-medium dark:text-gray-100 transition-colors"
              >
                <RotateCcw size={14} /> Generate New Plan
              </button>
              {selectedPlanIsConfirmed ? (
                <div className="flex-1 bg-green-50 border border-green-200 text-green-700 rounded-xl py-3 font-semibold flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} /> Already Confirmed Plan
                </div>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={!selectedPlan?.id}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <CheckCircle2 size={16} /> Confirm Selected Plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === 'confirming' && (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <RefreshCw size={28} className="animate-spin text-indigo-400" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">Creating your sessions...</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm dark:shadow-none dark:border dark:border-slate-700 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Sessions Created!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Your study sessions are ready. You can still open this page again to sync or unsync the active plan.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleSyncCalendar}
              disabled={calendarSyncing || !selectedPlan?.id}
              className="flex-1 flex items-center justify-center gap-2 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl py-2.5 text-sm font-medium dark:text-gray-100 transition-colors"
            >
              {calendarSyncing ? <RefreshCw size={14} className="animate-spin" /> : <Calendar size={14} className="text-indigo-500" />}
              Sync Calendar
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm dark:shadow-none dark:border dark:border-slate-700 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={30} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h2>
          <p className="text-sm text-red-500 mb-6">{errorMsg}</p>
          <button
            onClick={() => setPhase('idle')}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 font-semibold"
          >
            Try Again
          </button>
        </div>
      )}

      {selectedSession && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50 p-4 flex items-center justify-center">
          <div className="w-full max-w-xl max-h-[85vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl dark:border dark:border-slate-700 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{selectedSession.title || selectedSession.topic || selectedSession.name || 'Session details'}</h3>
                {selectedSession.session_number && (
                  <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">Session {selectedSession.session_number}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedSession(null);
                  setSessionDetailError('');
                  setSessionDetailLoading(false);
                }}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Close session details"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {sessionDetailLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                  <RefreshCw size={14} className="animate-spin" />
                  Loading full session details...
                </div>
              )}

              {sessionDetailError && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {sessionDetailError}
                </p>
              )}

              {(selectedSession.date_time || selectedSession.start_time || selectedSession.starts_at || selectedSession.scheduled_at) && (
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <span className="font-semibold">Date/Time: </span>
                  {(() => {
                    const startValue = selectedSession.date_time || selectedSession.start_time || selectedSession.starts_at || selectedSession.scheduled_at;
                    const endValue = selectedSession.end_time || selectedSession.ends_at;
                    const start = new Date(startValue);
                    const end = endValue ? new Date(endValue) : null;
                    if (Number.isNaN(start.getTime())) return String(startValue);
                    const datePart = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                    const startPart = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    if (!end || Number.isNaN(end.getTime())) return `${datePart}, ${startPart}`;
                    const endPart = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    return `${datePart}, ${startPart} - ${endPart}`;
                  })()}
                </p>
              )}

              {Array.isArray(selectedSession.focus_topics) && selectedSession.focus_topics.length > 0 && (
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <span className="font-semibold">Focus Topics: </span>
                  {selectedSession.focus_topics.join(', ')}
                </p>
              )}

              {Array.isArray(selectedSession.focus_chunks) && selectedSession.focus_chunks.length > 0 && (
                <div className="text-sm text-gray-700 dark:text-gray-200">
                  <p className="font-semibold mb-1">Focus Chunks:</p>
                  <ul className="space-y-1.5 text-sm">
                    {selectedSession.focus_chunks.slice(0, 4).map((chunk, idx) => (
                      <li key={chunk.chunk_id || idx} className="bg-gray-50 dark:bg-slate-700 rounded-lg px-3 py-2">
                        <p className="font-medium text-gray-800 dark:text-gray-100">{chunk.topic || `Chunk ${idx + 1}`}</p>
                        {Array.isArray(chunk.focus_points) && chunk.focus_points.length > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5">{chunk.focus_points.join(', ')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(selectedSession.prerequisites) && selectedSession.prerequisites.length > 0 && (
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <span className="font-semibold">Prerequisites: </span>
                  {selectedSession.prerequisites.join(', ')}
                </p>
              )}

              {selectedSession.status && (
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <span className="font-semibold">Status: </span>
                  {selectedSession.status}
                </p>
              )}

              {selectedSession.notes && (
                <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                  <span className="font-semibold">Notes: </span>
                  {selectedSession.notes}
                </p>
              )}

              {selectedSession.briefing && (
                <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                  <span className="font-semibold">Briefing: </span>
                  {selectedSession.briefing}
                </p>
              )}

              {selectedSession.calendar_status && (
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <span className="font-semibold">Calendar: </span>
                  {selectedSession.calendar_status}
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700 flex gap-2">
              <button
                onClick={() => {
                  setSelectedSession(null);
                  setSessionDetailError('');
                  setSessionDetailLoading(false);
                }}
                className="flex-1 border border-gray-200 dark:border-slate-600 rounded-xl py-2.5 text-sm font-medium text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (!selectedSession.id) return;
                  const targetSessionId = selectedSession.id;
                  setSelectedSession(null);
                  navigate(`/sessions/${targetSessionId}`);
                }}
                disabled={!selectedSession.id}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
              >
                <MessageSquare size={14} /> Open Session Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
