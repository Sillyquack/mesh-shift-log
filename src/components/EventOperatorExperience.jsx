import { useEffect, useMemo, useState } from "react";
import "./EventOperatorExperience.css";

const SESSION_KEY = "mesh-current-user-v1";
const COMPLETE_STATUSES = new Set(["done", "completed"]);
const EXCLUDED_STATUSES = new Set(["cancelled", "missed", "not_applicable"]);
const PHASES = [
  { id: "prepare", label: "Prepare", caption: "Set the room and remove surprises" },
  { id: "welcome", label: "Welcome", caption: "Meet the client and open smoothly" },
  { id: "run", label: "Run", caption: "Stay one step ahead" },
  { id: "close", label: "Close", caption: "Reset, count and leave it beautiful" },
];
const ISSUE_PRESETS = [
  { id: "client_request", label: "Client changed the plan", shortLabel: "Plan changed", priority: "important" },
  { id: "technical", label: "Technical problem", shortLabel: "Tech problem", priority: "critical" },
  { id: "stock", label: "Something is missing", shortLabel: "Missing item", priority: "important" },
  { id: "issue", label: "I need support", shortLabel: "Need support", priority: "important" },
];

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function isEventOperator(user) {
  return normalized(user?.role) === "event_floor_manager" && user?.isManager !== true;
}

export function readCurrentEventOperator() {
  if (typeof window === "undefined") return null;
  try {
    const user = JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null");
    return isEventOperator(user) ? user : null;
  } catch {
    return null;
  }
}

function validTime(value) {
  const milliseconds = new Date(value || "").getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function taskTime(task) {
  return validTime(task?.dueAt || task?.startsAt || task?.scheduledAt || task?.targetAt);
}

function taskIsComplete(task, optimisticDone) {
  return COMPLETE_STATUSES.has(normalized(task?.status)) || optimisticDone.has(task?.id);
}

function taskIsExcluded(task) {
  return task?.active === false || EXCLUDED_STATUSES.has(normalized(task?.status));
}

function phaseForTask(task, eventOperation) {
  const explicit = normalized(task?.phase || task?.metadata?.phase);
  const title = normalized(task?.title);
  if (["before", "prepare", "preparation", "setup"].includes(explicit)) return "prepare";
  if (["after", "close", "closing", "reset"].includes(explicit)) return "close";
  if (["welcome", "arrival", "doors"].includes(explicit)) return "welcome";
  if (["during", "run", "service", "live"].includes(explicit)) return "run";
  if (/\b(welcome|client arrival|guest arrival|doors open|meet client)\b/.test(title)) return "welcome";
  if (/\b(after|close|closing|reset|invoice|count products|last call|lock|alarm)\b/.test(title)) return "close";
  if (/\b(before|prepare|prep|rig|setup|ready|check booking)\b/.test(title)) return "prepare";
  const due = taskTime(task);
  const startsAt = validTime(eventOperation?.startsAt);
  const endsAt = validTime(eventOperation?.endsAt);
  if (due !== null && startsAt !== null && due < startsAt) return "prepare";
  if (due !== null && endsAt !== null && due >= endsAt) return "close";
  return "run";
}

function formatTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatRange(start, end) {
  return `${formatTime(start)}${end ? `–${formatTime(end)}` : ""}`;
}

function dueLabel(task, now) {
  const due = taskTime(task);
  if (due === null) return "When ready";
  const minutes = Math.round((due - validTime(now)) / 60000);
  if (minutes < -1) return `${Math.abs(minutes)} min late`;
  if (minutes <= 1) return "Now";
  if (minutes < 60) return `In ${minutes} min`;
  return formatTime(due);
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date()));
  if (hour < 11) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initials(value) {
  return String(value || "Event Lead")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "EL";
}

function phaseState(phase, selectedPhase, currentPhase, completed, total) {
  if (total > 0 && completed >= total) return "complete";
  if (phase === currentPhase) return "current";
  if (phase === selectedPhase) return "selected";
  return "upcoming";
}

function TaskCard({ task, now, complete, pending, optimisticDone, onComplete, onGuide, compact = false }) {
  const done = taskIsComplete(task, optimisticDone);
  const guideId = task?.rigRef || task?.guideRef || task?.metadata?.rigRef || task?.metadata?.guideRef || "";
  return (
    <article className={`event-operator-task ${done ? "is-complete" : ""} ${compact ? "is-compact" : ""}`}>
      <div className="event-operator-task-check" aria-hidden="true">{done ? "✓" : ""}</div>
      <div className="event-operator-task-copy">
        <div className="event-operator-task-meta">
          <span>{task?.zone && task.zone !== "all" ? task.zone.replaceAll("_", " ") : "Event floor"}</span>
          <time>{done ? "Done" : dueLabel(task, now)}</time>
        </div>
        <h3>{task?.title || "Event task"}</h3>
        {task?.description ? <p>{task.description}</p> : null}
        <div className="event-operator-task-actions">
          {guideId && onGuide ? (
            <button type="button" className="event-operator-link" onClick={() => onGuide(guideId)}>
              Show visual guide
            </button>
          ) : null}
          {!done && !complete ? (
            <button
              type="button"
              className="event-operator-complete-button"
              disabled={pending}
              onClick={() => onComplete(task)}
            >
              {pending ? "Saving…" : "Complete task"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function EventOperatorExperience({
  user,
  eventOperation,
  tasks = [],
  timeline,
  openUpdates = [],
  guides = [],
  status = {},
  now = new Date().toISOString(),
  onBack,
  onRefresh,
  onTaskStatus,
  onCreateLiveUpdate,
  onOpenGuide,
}) {
  const [view, setView] = useState("focus");
  const [selectedPhase, setSelectedPhase] = useState("prepare");
  const [optimisticDone, setOptimisticDone] = useState(() => new Set());
  const [pendingTaskId, setPendingTaskId] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [issuePreset, setIssuePreset] = useState(null);
  const [issueDetails, setIssueDetails] = useState("");
  const [issueSaving, setIssueSaving] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.add("event-operator-active");
    return () => document.body.classList.remove("event-operator-active");
  }, []);

  useEffect(() => {
    setOptimisticDone(new Set());
    setPendingTaskId("");
    setFeedback({ type: "", message: "" });
  }, [eventOperation?.id]);

  const orderedTasks = useMemo(() => {
    return tasks
      .filter((task) => !taskIsExcluded(task))
      .map((task, index) => ({ task, index, phase: phaseForTask(task, eventOperation), time: taskTime(task) }))
      .sort((left, right) => {
        const leftDone = taskIsComplete(left.task, optimisticDone) ? 1 : 0;
        const rightDone = taskIsComplete(right.task, optimisticDone) ? 1 : 0;
        if (leftDone !== rightDone) return leftDone - rightDone;
        if (left.time !== null && right.time !== null && left.time !== right.time) return left.time - right.time;
        if (left.time !== null) return -1;
        if (right.time !== null) return 1;
        return left.index - right.index;
      });
  }, [tasks, eventOperation, optimisticDone]);

  const activeTasks = orderedTasks.map((entry) => entry.task);
  const completedCount = activeTasks.filter((task) => taskIsComplete(task, optimisticDone)).length;
  const totalCount = activeTasks.length;
  const progress = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextEntry = orderedTasks.find((entry) => !taskIsComplete(entry.task, optimisticDone)) || null;
  const nextTask = nextEntry?.task || null;
  const currentPhase = nextEntry?.phase || (progress === 100 ? "close" : "prepare");
  const phaseStats = useMemo(() => {
    return Object.fromEntries(PHASES.map((phase) => {
      const phaseTasks = orderedTasks.filter((entry) => entry.phase === phase.id).map((entry) => entry.task);
      return [phase.id, {
        tasks: phaseTasks,
        total: phaseTasks.length,
        complete: phaseTasks.filter((task) => taskIsComplete(task, optimisticDone)).length,
      }];
    }));
  }, [orderedTasks, optimisticDone]);
  const selectedStats = phaseStats[selectedPhase] || { tasks: [], total: 0, complete: 0 };
  const relevantGuides = guides.slice(0, 8);
  const eventLeadName = user?.operatorName || user?.name || "Event Lead";
  const eventFacts = [
    eventOperation?.venue || "Venue to be confirmed",
    formatRange(eventOperation?.startsAt, eventOperation?.endsAt),
    eventOperation?.expectedGuests || eventOperation?.guestCount || eventOperation?.metadata?.guestCount
      ? `${eventOperation?.expectedGuests || eventOperation?.guestCount || eventOperation?.metadata?.guestCount} guests`
      : "Guest count not set",
  ];

  useEffect(() => {
    setSelectedPhase(currentPhase);
  }, [currentPhase]);

  async function completeTask(task) {
    if (!task?.id || pendingTaskId) return;
    setPendingTaskId(task.id);
    setFeedback({ type: "", message: "" });
    try {
      const result = await onTaskStatus?.(task.id, "done", "Completed in Event Mode");
      if (result?.ok === false || result?.error) {
        setFeedback({ type: "error", message: result?.message || result?.error?.message || "This task was not saved. Try again." });
        return;
      }
      setOptimisticDone((current) => new Set([...current, task.id]));
      setFeedback({ type: "success", message: "Beautiful. Next mission unlocked." });
    } catch (error) {
      setFeedback({ type: "error", message: error?.message || "This task was not saved. Try again." });
    } finally {
      setPendingTaskId("");
    }
  }

  async function submitIssue(event) {
    event.preventDefault();
    if (!issuePreset || issueSaving) return;
    setIssueSaving(true);
    setFeedback({ type: "", message: "" });
    try {
      const result = await onCreateLiveUpdate?.({
        eventId: eventOperation?.id,
        updateType: issuePreset.id,
        title: issuePreset.label,
        details: issueDetails.trim(),
        zone: nextTask?.zone || "all",
        priority: issuePreset.priority,
        ownerRoleKey: "event_floor_manager",
        occurredAt: new Date().toISOString(),
        createdByName: eventLeadName,
        metadata: { source: "event_operator_mode" },
      });
      if (result?.ok === false || result?.error) {
        setFeedback({ type: "error", message: result?.message || result?.error?.message || "Your update was not saved. Try again." });
        return;
      }
      setIssuePreset(null);
      setIssueDetails("");
      setFeedback({ type: "success", message: "Support update sent. Keep moving — the team can see it." });
    } catch (error) {
      setFeedback({ type: "error", message: error?.message || "Your update was not saved. Try again." });
    } finally {
      setIssueSaving(false);
    }
  }

  return (
    <section className="event-operator-experience" aria-label="Event Mode">
      <div className="event-operator-ambient" aria-hidden="true" />
      <header className="event-operator-topbar">
        <button type="button" className="event-operator-icon-button" onClick={onBack} aria-label="Back to event home">←</button>
        <div className="event-operator-brand">
          <span>EVENT MODE</span>
          <strong>{eventOperation?.title || "Today’s event"}</strong>
        </div>
        <button type="button" className="event-operator-avatar" onClick={() => onRefresh?.("operator_manual")} aria-label="Refresh event">
          {initials(eventLeadName)}
        </button>
      </header>

      <main className="event-operator-content">
        {view === "focus" ? (
          <>
            <section className="event-operator-hero">
              <div>
                <p className="event-operator-kicker">{greeting()}, {eventLeadName.split(" ")[0]}.</p>
                <h1>{progress === 100 ? "That’s a wrap." : "You’ve got this."}</h1>
                <p>{progress === 100 ? "The event journey is complete. Finish the final handover calmly." : "One clear step at a time. The rest stays out of your way."}</p>
                <div className="event-operator-facts">
                  {eventFacts.map((fact) => <span key={fact}>{fact}</span>)}
                </div>
              </div>
              <div className="event-operator-progress-ring" style={{ "--event-progress": `${progress}%` }} aria-label={`${progress}% complete`}>
                <div><strong>{progress}%</strong><span>{completedCount}/{totalCount || 0} done</span></div>
              </div>
            </section>

            {feedback.message || status.message ? (
              <p role="status" className={`event-operator-feedback is-${feedback.type || status.type || "info"}`}>
                {feedback.message || status.message}
              </p>
            ) : null}

            {nextTask ? (
              <section className="event-operator-focus-card">
                <div className="event-operator-focus-label">
                  <span>UP NEXT</span>
                  <time>{dueLabel(nextTask, now)}</time>
                </div>
                <TaskCard
                  task={nextTask}
                  now={now}
                  pending={pendingTaskId === nextTask.id}
                  optimisticDone={optimisticDone}
                  onComplete={completeTask}
                  onGuide={onOpenGuide}
                />
                <button type="button" className="event-operator-help-button" onClick={() => { setIssuePreset(ISSUE_PRESETS[3]); setView("help"); }}>
                  Need help with this step?
                </button>
              </section>
            ) : (
              <section className="event-operator-finish-card">
                <span className="event-operator-finish-mark" aria-hidden="true">✓</span>
                <p>MISSION COMPLETE</p>
                <h2>Beautiful work.</h2>
                <span>Every active task is complete. Do one calm final walk-through before you leave.</span>
              </section>
            )}

            <section className="event-operator-mission-map">
              <div className="event-operator-section-heading">
                <div><span>MISSION MAP</span><h2>Your event journey</h2></div>
                <button type="button" onClick={() => setView("journey")}>View all</button>
              </div>
              <div className="event-operator-phases">
                {PHASES.map((phase, index) => {
                  const stats = phaseStats[phase.id];
                  const state = phaseState(phase.id, selectedPhase, currentPhase, stats.complete, stats.total);
                  return (
                    <button
                      key={phase.id}
                      type="button"
                      className={`event-operator-phase is-${state}`}
                      onClick={() => { setSelectedPhase(phase.id); setView("journey"); }}
                    >
                      <span className="event-operator-phase-number">{stats.total > 0 && stats.complete === stats.total ? "✓" : index + 1}</span>
                      <strong>{phase.label}</strong>
                      <small>{stats.complete}/{stats.total}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            {openUpdates.length ? (
              <section className="event-operator-alert-card">
                <div><span>TEAM SIGNALS</span><strong>{openUpdates.length} open update{openUpdates.length === 1 ? "" : "s"}</strong></div>
                <button type="button" onClick={() => setView("help")}>Review</button>
              </section>
            ) : null}
          </>
        ) : null}

        {view === "journey" ? (
          <section className="event-operator-journey">
            <div className="event-operator-section-heading is-large">
              <div><span>YOUR JOURNEY</span><h1>Everything, in the right order.</h1></div>
              <strong>{progress}%</strong>
            </div>
            <div className="event-operator-phase-tabs" role="tablist" aria-label="Event phases">
              {PHASES.map((phase) => (
                <button
                  key={phase.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedPhase === phase.id}
                  className={selectedPhase === phase.id ? "is-active" : ""}
                  onClick={() => setSelectedPhase(phase.id)}
                >
                  {phase.label}
                  <small>{phaseStats[phase.id].complete}/{phaseStats[phase.id].total}</small>
                </button>
              ))}
            </div>
            <div className="event-operator-phase-intro">
              <div><span>{PHASES.find((phase) => phase.id === selectedPhase)?.label}</span><h2>{PHASES.find((phase) => phase.id === selectedPhase)?.caption}</h2></div>
              <strong>{selectedStats.total ? Math.round((selectedStats.complete / selectedStats.total) * 100) : 0}%</strong>
            </div>
            <div className="event-operator-task-list">
              {selectedStats.tasks.length ? selectedStats.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  now={now}
                  complete={taskIsComplete(task, optimisticDone)}
                  pending={pendingTaskId === task.id}
                  optimisticDone={optimisticDone}
                  onComplete={completeTask}
                  onGuide={onOpenGuide}
                  compact
                />
              )) : <p className="event-operator-empty">No tasks in this phase. You’re clear to move on.</p>}
            </div>
          </section>
        ) : null}

        {view === "help" ? (
          <section className="event-operator-help-view">
            <div className="event-operator-section-heading is-large">
              <div><span>HELP & GUIDES</span><h1>Get unstuck in seconds.</h1></div>
            </div>
            <section className="event-operator-help-panel">
              <h2>What happened?</h2>
              <p>Choose the closest match. Add a short note only when it helps the team act.</p>
              <div className="event-operator-issue-grid">
                {ISSUE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={issuePreset?.id === preset.id ? "is-selected" : ""}
                    onClick={() => setIssuePreset(preset)}
                  >
                    <span aria-hidden="true">{preset.id === "technical" ? "⚡" : preset.id === "stock" ? "□" : preset.id === "client_request" ? "↻" : "!"}</span>
                    <strong>{preset.shortLabel}</strong>
                  </button>
                ))}
              </div>
              {issuePreset ? (
                <form className="event-operator-issue-form" onSubmit={submitIssue}>
                  <label>
                    <span>Optional note</span>
                    <textarea rows="3" value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} placeholder="What does the team need to know?" />
                  </label>
                  <button type="submit" disabled={issueSaving}>{issueSaving ? "Sending…" : "Send update"}</button>
                </form>
              ) : null}
            </section>

            <section className="event-operator-guides">
              <div className="event-operator-section-heading"><div><span>VISUAL STANDARDS</span><h2>Show me how it should look</h2></div></div>
              <div className="event-operator-guide-grid">
                {relevantGuides.length ? relevantGuides.map((guide) => (
                  <button key={guide.id} type="button" onClick={() => onOpenGuide?.(guide.id)}>
                    <span aria-hidden="true">◎</span>
                    <div><strong>{guide.title}</strong><small>{guide.checklist?.[0] || "Open guide"}</small></div>
                    <b aria-hidden="true">→</b>
                  </button>
                )) : <p className="event-operator-empty">No visual guides are linked to this event yet.</p>}
              </div>
            </section>

            {openUpdates.length ? (
              <section className="event-operator-open-updates">
                <div className="event-operator-section-heading"><div><span>OPEN UPDATES</span><h2>What the team is watching</h2></div></div>
                {openUpdates.map((update) => (
                  <article key={update.id}>
                    <span>{update.priority || "normal"}</span>
                    <div><strong>{update.title}</strong>{update.details ? <p>{update.details}</p> : null}</div>
                    <time>{formatTime(update.occurredAt)}</time>
                  </article>
                ))}
              </section>
            ) : null}
          </section>
        ) : null}
      </main>

      <nav className="event-operator-nav" aria-label="Event Mode sections">
        <button type="button" className={view === "focus" ? "is-active" : ""} onClick={() => setView("focus")}><span aria-hidden="true">●</span><strong>Focus</strong></button>
        <button type="button" className={view === "journey" ? "is-active" : ""} onClick={() => setView("journey")}><span aria-hidden="true">≡</span><strong>Journey</strong></button>
        <button type="button" className={view === "help" ? "is-active" : ""} onClick={() => setView("help")}><span aria-hidden="true">?</span><strong>Help</strong>{openUpdates.length ? <small>{openUpdates.length}</small> : null}</button>
      </nav>
    </section>
  );
}
