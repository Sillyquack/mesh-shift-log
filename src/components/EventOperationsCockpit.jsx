import { eventRigGuides } from "../data/eventRigGuides.js";
import EventOperatorExperience, {
  isEventOperator,
  readCurrentEventOperator,
} from "./EventOperatorExperience.jsx";
import ManagerEventOperationsCockpit, {
  EventCockpitSummaryCard as ManagerEventCockpitSummaryCard,
} from "./ManagerEventOperationsCockpit.jsx";

const COMPLETE_STATUSES = new Set(["done", "completed"]);
const EXCLUDED_STATUSES = new Set(["cancelled", "missed", "not_applicable"]);

function normalized(value) {
  return String(value || "").trim().toLowerCase();
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

function taskTime(task) {
  const milliseconds = new Date(
    task?.dueAt || task?.startsAt || task?.scheduledAt || task?.targetAt || "",
  ).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : Number.MAX_SAFE_INTEGER;
}

function taskProgress(eventTasks = []) {
  const active = eventTasks.filter(
    (task) => task.active !== false && !EXCLUDED_STATUSES.has(normalized(task.status)),
  );
  const completed = active.filter((task) => COMPLETE_STATUSES.has(normalized(task.status))).length;
  const next = active
    .filter((task) => !COMPLETE_STATUSES.has(normalized(task.status)))
    .sort((left, right) => taskTime(left) - taskTime(right))[0] || null;
  return {
    completed,
    total: active.length,
    progress: active.length ? Math.round((completed / active.length) * 100) : 0,
    next,
  };
}

function eventGuideSelection(eventOperation, eventTasks = []) {
  const referenced = new Set(
    eventTasks.flatMap((task) => [
      task?.rigRef,
      task?.guideRef,
      task?.metadata?.rigRef,
      task?.metadata?.guideRef,
    ]).filter(Boolean),
  );
  const zones = new Set(eventTasks.map((task) => normalized(task?.zone)).filter(Boolean));
  const eventText = normalized([
    eventOperation?.title,
    eventOperation?.venue,
    eventOperation?.description,
    eventOperation?.notes,
  ].filter(Boolean).join(" "));

  return eventRigGuides.filter((guide) =>
    referenced.has(guide.id) ||
    guide.venueKeys?.some((key) => {
      const venueKey = normalized(key);
      return venueKey === "all" || zones.has(venueKey) || eventText.includes(venueKey);
    }),
  );
}

export function EventCockpitSummaryCard(props) {
  const {
    eventOperation,
    eventTasks = [],
    onOpen,
  } = props;
  const operatorSession = readCurrentEventOperator();

  if (!operatorSession) return <ManagerEventCockpitSummaryCard {...props} />;
  if (!eventOperation) return null;

  const progress = taskProgress(eventTasks);
  const firstName = String(
    operatorSession.operatorName || operatorSession.name || "Event Lead",
  ).split(" ")[0];

  return (
    <section className="event-operator-launcher" aria-label="Open Event Mode">
      <div className="event-operator-launcher-copy">
        <span>YOUR EVENT</span>
        <h2>Welcome back, {firstName}.</h2>
        <p>
          {eventOperation.title} is ready. Open one calm, guided workspace with only
          the steps that matter now.
        </p>
        <div className="event-operator-launcher-next">
          <span>NEXT</span>
          <strong>
            {progress.next?.title ||
              (progress.progress === 100
                ? "Final walk-through"
                : "Open the event journey")}
          </strong>
        </div>
      </div>
      <div className="event-operator-launcher-action">
        <div
          className="event-operator-launcher-ring"
          style={{ "--event-progress": `${progress.progress}%` }}
          aria-label={`${progress.progress}% complete`}
        >
          <div>
            <strong>{progress.progress}%</strong>
            <span>{progress.completed}/{progress.total} complete</span>
          </div>
        </div>
        <button type="button" onClick={onOpen}>Open Event Mode →</button>
        <small>
          {eventOperation.venue || "Venue not set"} · {formatRange(
            eventOperation.startsAt,
            eventOperation.endsAt,
          )}
        </small>
      </div>
    </section>
  );
}

export default function EventOperationsCockpit(props) {
  const {
    user,
    eventOperation,
    eventTasks = [],
    liveUpdates = [],
    onClose,
    onRefresh,
    onTaskStatus,
    onCreateLiveUpdate,
    onOpenGuide,
  } = props;

  if (!isEventOperator(user)) return <ManagerEventOperationsCockpit {...props} />;

  return (
    <EventOperatorExperience
      user={user}
      eventOperation={eventOperation}
      tasks={eventTasks}
      openUpdates={liveUpdates.filter(
        (update) =>
          ["open", "acknowledged"].includes(normalized(update.status)) ||
          normalized(update.priority) === "critical",
      )}
      guides={eventGuideSelection(eventOperation, eventTasks)}
      now={new Date().toISOString()}
      onBack={onClose}
      onRefresh={onRefresh}
      onTaskStatus={onTaskStatus}
      onCreateLiveUpdate={onCreateLiveUpdate}
      onOpenGuide={onOpenGuide}
    />
  );
}
