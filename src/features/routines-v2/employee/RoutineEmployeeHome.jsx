import { useMemo, useRef, useState } from "react";
import {
  routineEmployeeRunMutations,
  routineEmployeeDoubleShiftMutations,
} from "../api/routineEmployeeClient.js";
import RoutineOfflineState from "./RoutineOfflineState.jsx";
import RoutineConflictPanel from "./RoutineConflictPanel.jsx";

const COMPLETE_STATUSES = new Set(["done", "completed", "finished", "accepted"]);

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function humanize(value) {
  return String(value || "Routine")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstName(value) {
  return String(value || "Team member").trim().split(/\s+/)[0] || "Team member";
}

function initials(value) {
  return String(value || "Team member")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TM";
}

function greeting(value) {
  const date = value ? new Date(value) : new Date();
  const hour = Number.isNaN(date.getTime())
    ? new Date().getHours()
    : Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Oslo",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(date));
  if (hour < 11) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Collection({ title, caption, items, empty, render }) {
  return (
    <section className="routine-experience-collection">
      <header>
        <div>
          <span>{caption}</span>
          <h2>{title}</h2>
        </div>
        <strong>{items.length}</strong>
      </header>
      {items.length ? (
        <div className="routine-experience-list">{items.map(render)}</div>
      ) : (
        <p className="routine-experience-empty">{empty}</p>
      )}
    </section>
  );
}

function RoutineCard({ title, meta, actionLabel, onAction, disabled = false, tone = "" }) {
  return (
    <article className={`routine-experience-card ${tone ? `is-${tone}` : ""}`.trim()}>
      <div>
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
      </div>
      {onAction ? (
        <button type="button" disabled={disabled} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

export default function RoutineEmployeeHome({
  home,
  onOpenRun,
  onOpenBundle,
  onOpenHandover,
  onOpenTransfer,
  onOpenHistory,
  onBack,
  runApi = routineEmployeeRunMutations,
  doubleShiftApi = routineEmployeeDoubleShiftMutations,
  onRefresh,
  pendingOverlay,
}) {
  const [view, setView] = useState("now");
  const [pending, setPending] = useState(null);
  const [feedback, setFeedback] = useState({ type: "", message: "", detail: "" });
  const operationKeys = useRef(new Map());
  const busy = useRef(false);
  const [conflictConfirmations, setConflictConfirmations] = useState({});
  const [doubleShiftKeys, setDoubleShiftKeys] = useState(() => ({
    opening: home.startableTemplates[0]?.routineKey ?? "",
    closing: home.startableTemplates[1]?.routineKey ?? "",
  }));

  const execute = async (key, action, payload) => {
    if (busy.current) return;
    busy.current = true;
    const idempotencyKey = operationKeys.current.get(key) ?? globalThis.crypto.randomUUID();
    operationKeys.current.set(key, idempotencyKey);
    setPending(key);
    setFeedback({ type: "", message: "", detail: "" });
    try {
      const response = await action({ ...payload, idempotencyKey });
      if (response?.ok) {
        operationKeys.current.delete(key);
        setFeedback({ type: "success", message: "Ready. Opening your work.", detail: "" });
        await onRefresh?.();
        const runId = response.data?.run?.id ?? response.data?.workspace?.run?.id;
        const bundleId = response.data?.bundle?.id ?? response.data?.workspace?.bundle?.id;
        if (runId) onOpenRun(runId);
        else if (bundleId) onOpenBundle(bundleId);
      } else {
        setFeedback({
          type: "error",
          message: "That action was not completed. Your current work is unchanged.",
          detail: response?.message ?? "Try again or ask a shift lead for help.",
        });
      }
    } catch (error) {
      setFeedback({
        type: "warning",
        message: "We could not confirm the result yet. Your work is still safe.",
        detail: String(error?.message || "Retrying will reuse the same protected request."),
      });
    } finally {
      busy.current = false;
      setPending(null);
    }
  };

  const identity = home.identity;
  const clock = home.operationalClock;
  const overlay = pendingOverlay?.entries ?? [];
  const displayName = identity.displayName || "Team member";
  const currentRun = home.currentRuns[0] || null;
  const assignedTask = home.assignedTasks.find((task) => !COMPLETE_STATUSES.has(normalized(task.status))) || home.assignedTasks[0] || null;
  const joinableRun = home.joinableRuns[0] || null;
  const doubleShift = home.doubleShiftBundles[0] || null;
  const startableTemplate = home.startableTemplates[0] || null;
  const attentionCount = home.openDeviations.length
    + home.pendingHandovers.length
    + home.pendingTransfers.length
    + home.eventTransferRequests.length
    + overlay.filter((entry) => entry.state === "conflict").length;

  const primaryMission = useMemo(() => {
    if (currentRun) {
      return {
        label: "CONTINUE NOW",
        title: humanize(currentRun.routineKey),
        description: `Your active ${humanize(currentRun.scopeKey || "shift").toLowerCase()} routine is ready where you left it.`,
        meta: currentRun.status ? humanize(currentRun.status) : "In progress",
        actionLabel: "Open routine →",
        onAction: () => onOpenRun(currentRun.id),
      };
    }
    if (assignedTask) {
      return {
        label: "UP NEXT",
        title: assignedTask.title,
        description: assignedTask.location ? `Continue in ${assignedTask.location}.` : "Open the task and follow the guided steps.",
        meta: assignedTask.status ? humanize(assignedTask.status) : "Assigned",
        actionLabel: "Open task →",
        onAction: () => onOpenRun(assignedTask.runId),
      };
    }
    if (joinableRun) {
      const key = `join:${joinableRun.id}`;
      return {
        label: "READY TO JOIN",
        title: humanize(joinableRun.routineKey),
        description: "A teammate has already started this routine. Join the shared run and continue together.",
        meta: joinableRun.operationalDate || "Today",
        actionLabel: pending === key ? "Joining…" : "Join routine →",
        disabled: !joinableRun.canJoin || Boolean(pending),
        onAction: () => execute(key, runApi.joinRoutineRun, { runId: joinableRun.id }),
      };
    }
    if (doubleShift) {
      return {
        label: "YOUR SHIFT",
        title: "Opening → Closing",
        description: "Your Double Shift journey is ready. Open it to see the next handover-safe step.",
        meta: humanize(doubleShift.status),
        actionLabel: "Open Double Shift →",
        onAction: () => onOpenBundle(doubleShift.id),
      };
    }
    if (startableTemplate) {
      const key = `create:${startableTemplate.templateId}`;
      return {
        label: "START HERE",
        title: startableTemplate.name,
        description: "Begin the routine and the app will guide the team through one clear step at a time.",
        meta: humanize(startableTemplate.routineKey),
        actionLabel: pending === key ? "Preparing…" : "Start routine →",
        disabled: !startableTemplate.action?.allowed || Boolean(pending),
        onAction: () => execute(key, runApi.createOrGetRoutineRun, {
          routineKey: startableTemplate.routineKey,
          scopeKey: "default",
          operationalDate: clock.operationalDate,
        }),
      };
    }
    return {
      label: "ALL CLEAR",
      title: "Nothing needs your attention right now.",
      description: "New work will appear here when a routine is published, assigned or handed over to you.",
      meta: "You are up to date",
      actionLabel: "Refresh",
      onAction: onRefresh,
    };
  }, [assignedTask, clock.operationalDate, currentRun, doubleShift, joinableRun, onOpenBundle, onOpenRun, onRefresh, pending, runApi, startableTemplate]);

  const activeWorkCount = home.currentRuns.length + home.doubleShiftBundles.length;
  const shiftSteps = [
    {
      id: "start",
      label: "Start",
      value: activeWorkCount ? "Ready" : "Next",
      state: activeWorkCount ? "complete" : "current",
    },
    {
      id: "work",
      label: "Work",
      value: `${home.assignedTasks.length} assigned`,
      state: activeWorkCount ? "current" : "upcoming",
    },
    {
      id: "handover",
      label: "Handover",
      value: `${home.pendingHandovers.length} pending`,
      state: home.pendingHandovers.length ? "current" : "upcoming",
    },
    {
      id: "finish",
      label: "Finish",
      value: "Later",
      state: "upcoming",
    },
  ];

  return (
    <main className="employee-workspace mesh-experience-shell routine-experience">
      <header className="mesh-experience-topbar">
        <button type="button" className="mesh-icon-action" onClick={onBack} aria-label="Back to app home">←</button>
        <div className="mesh-experience-brand">
          <span>SHIFT MODE</span>
          <strong>Today&apos;s routines</strong>
        </div>
        <button type="button" className="mesh-avatar-action" onClick={onRefresh} aria-label="Refresh shift">
          {initials(displayName)}
        </button>
      </header>

      <div className="mesh-experience-content routine-experience-content">
        {view === "now" ? (
          <>
            <section className="mesh-hero routine-experience-hero">
              <div>
                <span className="mesh-kicker">{greeting(clock.serverNow)}, {firstName(displayName)}.</span>
                <h1>Your shift, without the noise.</h1>
                <p>One clear action now. Everything else waits until you need it.</p>
                <div className="mesh-facts">
                  <span>{clock.operationalDate || "Today"}</span>
                  <span>{activeWorkCount} active routine{activeWorkCount === 1 ? "" : "s"}</span>
                  <span>{home.assignedTasks.length} assigned task{home.assignedTasks.length === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="routine-experience-orbit" aria-label={`${attentionCount} items need attention`}>
                <strong>{attentionCount}</strong>
                <span>need attention</span>
              </div>
            </section>

            {home.readOnlyPreview ? (
              <p className="mesh-status is-warning" role="status">
                Preview only. You can explore the flow, but actions are not enabled yet.
              </p>
            ) : null}

            {feedback.message ? (
              <div className={`mesh-status is-${feedback.type || "info"}`} role="status" aria-live="polite">
                <div>
                  <strong>{feedback.message}</strong>
                  {feedback.detail ? (
                    <details>
                      <summary>Show details</summary>
                      <p>{feedback.detail}</p>
                    </details>
                  ) : null}
                </div>
              </div>
            ) : null}

            <section className="mesh-focus-card routine-primary-mission">
              <div className="mesh-focus-heading">
                <span>{primaryMission.label}</span>
                <time>{primaryMission.meta}</time>
              </div>
              <h2>{primaryMission.title}</h2>
              <p>{primaryMission.description}</p>
              <button
                type="button"
                className="mesh-primary-action"
                disabled={primaryMission.disabled}
                onClick={primaryMission.onAction}
              >
                {primaryMission.actionLabel}
              </button>
            </section>

            <section className="mesh-panel routine-shift-map">
              <div className="mesh-section-heading">
                <div>
                  <span className="mesh-section-label">SHIFT MAP</span>
                  <h2>Your journey today</h2>
                </div>
                <button type="button" className="mesh-text-action" onClick={() => setView("shift")}>View shift</button>
              </div>
              <div className="mesh-mission-map">
                {shiftSteps.map((step) => (
                  <article key={step.id} className={`mesh-mission-step is-${step.state}`}>
                    <span>{step.state === "complete" ? "✓" : "•"}</span>
                    <strong>{step.label}</strong>
                    <small>{step.value}</small>
                  </article>
                ))}
              </div>
            </section>

            {attentionCount > 0 ? (
              <section className="routine-attention-card">
                <div>
                  <span>TEAM SIGNALS</span>
                  <strong>{attentionCount} item{attentionCount === 1 ? "" : "s"} need attention</strong>
                </div>
                <button type="button" onClick={() => setView("help")}>Review</button>
              </section>
            ) : null}
          </>
        ) : null}

        {view === "shift" ? (
          <section className="routine-experience-view">
            <header className="routine-experience-view-heading">
              <div>
                <span>YOUR SHIFT</span>
                <h1>Everything in the right place.</h1>
                <p>Open current work first. Start something new only when the shift needs it.</p>
              </div>
              <strong>{activeWorkCount}</strong>
            </header>

            <Collection
              title="Current work"
              caption="CONTINUE"
              items={home.currentRuns}
              empty="No routine is currently in progress."
              render={(run) => (
                <RoutineCard
                  key={run.id}
                  title={humanize(run.routineKey)}
                  meta={`${humanize(run.scopeKey)} · ${humanize(run.status)}`}
                  actionLabel="Open"
                  onAction={() => onOpenRun(run.id)}
                  tone="active"
                />
              )}
            />

            <Collection
              title="Available to join"
              caption="TEAM WORK"
              items={home.joinableRuns}
              empty="No shared routine is waiting for you."
              render={(run) => {
                const key = `join:${run.id}`;
                return (
                  <RoutineCard
                    key={run.id}
                    title={humanize(run.routineKey)}
                    meta={run.operationalDate || "Today"}
                    actionLabel={pending === key ? "Joining…" : "Join"}
                    disabled={!run.canJoin || Boolean(pending)}
                    onAction={() => execute(key, runApi.joinRoutineRun, { runId: run.id })}
                  />
                );
              }}
            />

            <Collection
              title="Start a routine"
              caption="AVAILABLE"
              items={home.startableTemplates}
              empty="No routine is available to start."
              render={(template) => {
                const key = `create:${template.templateId}`;
                return (
                  <RoutineCard
                    key={template.templateId}
                    title={template.name}
                    meta={humanize(template.routineKey)}
                    actionLabel={pending === key ? "Preparing…" : "Start"}
                    disabled={!template.action?.allowed || Boolean(pending)}
                    onAction={() => execute(key, runApi.createOrGetRoutineRun, {
                      routineKey: template.routineKey,
                      scopeKey: "default",
                      operationalDate: clock.operationalDate,
                    })}
                  />
                );
              }}
            />

            <Collection
              title="Double Shift"
              caption="OPENING → CLOSING"
              items={home.doubleShiftBundles}
              empty="No Double Shift is active."
              render={(bundle) => (
                <RoutineCard
                  key={bundle.id}
                  title="Opening → Closing"
                  meta={`${humanize(bundle.status)} · ${bundle.operationalDate}`}
                  actionLabel="Open"
                  onAction={() => onOpenBundle(bundle.id)}
                  tone="active"
                />
              )}
            />

            {home.startableTemplates.length >= 2 ? (
              <details className="routine-double-shift-builder">
                <summary>Start or open a Double Shift</summary>
                <div className="routine-double-shift-fields">
                  <label>
                    <span>Opening routine</span>
                    <select
                      value={doubleShiftKeys.opening}
                      onChange={(event) => setDoubleShiftKeys((current) => ({ ...current, opening: event.target.value }))}
                    >
                      {home.startableTemplates.map((template) => (
                        <option key={`opening-${template.templateId}`} value={template.routineKey}>{template.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Closing routine</span>
                    <select
                      value={doubleShiftKeys.closing}
                      onChange={(event) => setDoubleShiftKeys((current) => ({ ...current, closing: event.target.value }))}
                    >
                      {home.startableTemplates.map((template) => (
                        <option key={`closing-${template.templateId}`} value={template.routineKey}>{template.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="mesh-primary-action"
                  disabled={!home.operationalAllowed || Boolean(pending) || !doubleShiftKeys.opening || !doubleShiftKeys.closing || doubleShiftKeys.opening === doubleShiftKeys.closing}
                  onClick={() => execute("create:double-shift", doubleShiftApi.createOrGet, {
                    openingRoutineKey: doubleShiftKeys.opening,
                    closingRoutineKey: doubleShiftKeys.closing,
                    scopeKey: "default",
                    operationalDate: clock.operationalDate,
                  })}
                >
                  {pending === "create:double-shift" ? "Preparing…" : "Start Double Shift"}
                </button>
              </details>
            ) : null}
          </section>
        ) : null}

        {view === "help" ? (
          <section className="routine-experience-view">
            <header className="routine-experience-view-heading">
              <div>
                <span>HELP & HANDOVERS</span>
                <h1>Get unstuck quickly.</h1>
                <p>Only the items that need a decision or another person appear here.</p>
              </div>
              <strong>{attentionCount}</strong>
            </header>

            <RoutineOfflineState sync={home.sync} overlay={overlay} />

            <Collection
              title="Handovers"
              caption="TAKE OVER OR PASS ON"
              items={home.pendingHandovers}
              empty="No handover needs your action."
              render={(item) => (
                <RoutineCard
                  key={item.id}
                  title={humanize(item.handoverType)}
                  meta={humanize(item.status)}
                  actionLabel="Open"
                  onAction={() => onOpenHandover?.(item.id)}
                />
              )}
            />

            <Collection
              title="Transfers"
              caption="RESPONSIBILITY"
              items={[...home.pendingTransfers, ...home.eventTransferRequests]}
              empty="No transfer needs your action."
              render={(item) => (
                <RoutineCard
                  key={item.id}
                  title={item.targetType === "event_operation" || item.targetEventId ? "Event transfer" : "Routine transfer"}
                  meta={[humanize(item.status), item.reason].filter(Boolean).join(" · ")}
                  actionLabel="Open"
                  onAction={() => onOpenTransfer?.(item.id)}
                />
              )}
            />

            <Collection
              title="Open deviations"
              caption="WHAT CHANGED"
              items={home.openDeviations}
              empty="No open deviation needs attention."
              render={(item) => (
                <RoutineCard
                  key={item.id}
                  title={humanize(item.category)}
                  meta={`${humanize(item.severity)} · ${humanize(item.status)}`}
                  tone={normalized(item.severity) === "critical" ? "risk" : ""}
                />
              )}
            />

            {overlay.filter((entry) => entry.state === "conflict").map((conflict) => (
              <RoutineConflictPanel
                key={conflict.operationId}
                conflict={conflict}
                resolutionConfirmed={conflictConfirmations[conflict.operationId] === true}
                onResolutionConfirmed={(checked) => setConflictConfirmations((current) => ({ ...current, [conflict.operationId]: checked }))}
                onRefresh={async () => {
                  await onRefresh?.();
                  await pendingOverlay?.refresh?.();
                  setFeedback({ type: "success", message: "The latest version is ready. Your local draft is unchanged.", detail: "" });
                }}
                onKeep={() => setFeedback({ type: "success", message: "Your local draft was kept.", detail: "" })}
                onDiscard={async () => {
                  await pendingOverlay?.discard?.(conflict.operationId);
                  setFeedback({ type: "success", message: "The local draft was discarded by your request.", detail: "" });
                }}
                onCreateNew={async () => {
                  if (conflict.taskId) {
                    if (conflict.runId) onOpenRun(conflict.runId);
                    setFeedback({
                      type: "warning",
                      message: "Open the affected task before creating a replacement.",
                      detail: "Review the current values and resolve the difference explicitly.",
                    });
                    return;
                  }
                  const run = home.currentRuns.find((candidate) => candidate.id === conflict.runId);
                  const response = await pendingOverlay?.createAfterConflict?.(
                    conflict.operationId,
                    { ...conflict.localDraft, baseRunRevision: run?.revision ?? conflict.serverRevision },
                    { runId: conflict.runId },
                  );
                  setFeedback(response?.ok
                    ? { type: "success", message: "A replacement action is ready for confirmation.", detail: "The routine remains open until the result is confirmed." }
                    : { type: "error", message: "The replacement was not created. Your draft is unchanged.", detail: response?.message || "" });
                }}
              />
            ))}

            {onOpenHistory ? (
              <button type="button" className="routine-history-action" onClick={onOpenHistory}>
                <span>MY HISTORY</span>
                <strong>Review completed routines →</strong>
              </button>
            ) : null}
          </section>
        ) : null}
      </div>

      <nav className="mesh-bottom-nav routine-experience-nav" aria-label="Shift Mode sections">
        <button type="button" className={view === "now" ? "is-active" : ""} onClick={() => setView("now")}>
          <span aria-hidden="true">●</span>
          <strong>Now</strong>
        </button>
        <button type="button" className={view === "shift" ? "is-active" : ""} onClick={() => setView("shift")}>
          <span aria-hidden="true">≡</span>
          <strong>Shift</strong>
        </button>
        <button type="button" className={view === "help" ? "is-active" : ""} onClick={() => setView("help")}>
          <span aria-hidden="true">?</span>
          <strong>Help</strong>
          {attentionCount ? <small>{attentionCount}</small> : null}
        </button>
      </nav>
    </main>
  );
}
