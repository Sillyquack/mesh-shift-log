import { useEffect, useMemo, useState } from 'react';
import {
  areas,
  defaultRoutines,
  knowledgeBase,
  normalizeRoutineTask,
  normalizeRoutines,
  shiftOptions,
  staffCodes,
} from './data/routines.js';

const LOG_KEY = 'mesh-shift-logs-v1';
const ROUTINE_KEY = 'mesh-routines-v1';
const SESSION_KEY = 'mesh-current-user-v1';
const HANDOVER_KEY = 'mesh-handover-notes-v1';
const PILOT_NOTICE_KEY = 'mesh-pilot-notice-accepted-v1';
const LAST_EXPORT_KEY = 'mesh-last-export-at-v1';

const priorityLabels = {
  normal: 'Normal',
  important: 'Important',
  critical: 'Critical',
};

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const shiftLabels = Object.fromEntries(shiftOptions.map((shift) => [shift.id, shift.label]));

const blankTask = {
  title: '',
  description: '',
  shiftType: 'opening',
  section: 'Opening 07:00-08:00',
  timeBlock: 'Opening 07:00-08:00',
  area: 'general',
  priority: 'normal',
  inputType: 'none',
  requiresComment: false,
  criticalConfirm: false,
  managerOnly: false,
  active: true,
};

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function readStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function groupBy(items, keyGetter) {
  return items.reduce((groups, item) => {
    const key = keyGetter(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function taskRunsToday(task, date) {
  if (!task.recurring || task.recurring.type === 'daily') return true;
  if (task.recurring.type === 'weekdays') {
    const weekday = weekdays[new Date(`${date}T12:00:00`).getDay()];
    return task.recurring.days?.includes(weekday);
  }
  if (task.recurring.type === 'specific_days') {
    return task.recurring.days?.includes(date);
  }
  return true;
}

function flattenTasks(routines, shiftType, date = todayKey()) {
  return normalizeRoutines(routines)
    .filter((section) => section.shiftType === shiftType)
    .flatMap((section) => section.tasks.map((task) => normalizeRoutineTask(task, section)))
    .filter((task) => task.active !== false && taskRunsToday(task, date));
}

function getTaskLog(logs, date, taskId) {
  return logs.find((log) => log.date === date && log.taskId === taskId);
}

function isHandled(log) {
  return log?.status === 'done' || log?.status === 'not_relevant';
}

function taskNeedsInput(task) {
  return task.inputType && task.inputType !== 'none';
}

function hasDeviation(log) {
  if (!log) return false;
  if (log.status === 'not_relevant') return true;
  if (log.comment) return true;
  if (!log.input) return false;
  if (log.inputType === 'yesno') return log.input === 'No';
  return ['number', 'text', 'comment'].includes(log.inputType);
}

function criticalConfirmMessage(task) {
  const seriousAreas = ['security', 'pos', 'salto', 'kitchen', 'event'];
  const isSerious = seriousAreas.includes(task.area) || task.section.toLowerCase().includes('security');
  const warning = isSerious
    ? 'This is a critical closing/security, financial or food safety task. Confirm only when you have physically checked it.'
    : 'This is a critical task. Confirm only when you have physically checked it.';
  return `${task.title}\n\n${warning}`;
}

function normalizeLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return logs
    .filter((log) => log && log.date && log.taskId)
    .map((log) => ({
      ...log,
      status: log.status || 'done',
      completedAt: log.completedAt || `${log.date}T00:00:00`,
      completedBy: log.completedBy || 'Unknown',
      input: log.input ?? log.comment ?? '',
      comment: log.comment ?? '',
    }));
}

function normalizeHandovers(notes) {
  return notes && typeof notes === 'object' && !Array.isArray(notes) ? notes : {};
}

function handoverHasContent(note) {
  return Boolean(note && [note.nextShift, note.lowStock, note.maintenance, note.memberEvent].some((value) => value?.trim()));
}

function validateHandoverImport(notes) {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
    throw new Error('Handover notes must be an object.');
  }
}

function validateRoutineImport(data) {
  if (!Array.isArray(data)) throw new Error('Routine file must contain an array.');
  if (data.length === 0) throw new Error('Routine file is empty.');
  const invalidSection = data.find((section) => !section || typeof section !== 'object' || !Array.isArray(section.tasks));
  if (invalidSection) throw new Error('Each routine section must be an object with a tasks array.');
  const invalidTask = data
    .flatMap((section) => section.tasks)
    .find((task) => !task || typeof task !== 'object' || !task.title);
  if (invalidTask) throw new Error('Each routine task must be an object with a title.');
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function routinesUseDefaults(routines) {
  return JSON.stringify(normalizeRoutines(routines)) === JSON.stringify(normalizeRoutines(defaultRoutines));
}

function PilotNotice({ onAccept }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pilot-title">
      <section className="pilot-modal">
        <p className="eyebrow">Pilot</p>
        <h1 id="pilot-title">Mesh Shift Log pilot</h1>
        <p>
          This is a local pilot version. Shift logs are saved only in this browser on this device.
          Manager should export backups regularly.
        </p>
        <button type="button" className="primary-button" onClick={onAccept}>I understand</button>
      </section>
    </div>
  );
}

function Login({ onLogin }) {
  const [code, setCode] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [pendingUser, setPendingUser] = useState(null);
  const [error, setError] = useState('');

  function finishLogin(user) {
    saveStorage(SESSION_KEY, user);
    onLogin(user);
  }

  function submit(event) {
    event.preventDefault();
    setError('');

    if (pendingUser) {
      const trimmedName = workerName.trim().replace(/\s+/g, ' ');
      if (trimmedName.length < 2) {
        setError('Please add your real first name before continuing.');
        return;
      }
      finishLogin({
        ...pendingUser,
        name: `${trimmedName} / ${pendingUser.name}`,
        staffName: trimmedName,
        baseName: pendingUser.name,
      });
      return;
    }

    const user = staffCodes.find((staff) => staff.code.toLowerCase() === code.trim().toLowerCase());
    if (!user) {
      setError('Code not found. Check the staff code and try again.');
      return;
    }
    if (user.needsName) {
      setPendingUser(user);
      return;
    }
    finishLogin(user);
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Mesh Youngstorget</p>
        <h1>Shift checklist</h1>
        <p className="muted">
          {pendingUser ? 'Use your real first name. This is saved with completed tasks.' : 'Sign in with your staff code to start today.'}
        </p>
        <form onSubmit={submit} className="login-form">
          {!pendingUser ? (
            <>
              <label htmlFor="staff-code">Staff code</label>
              <input
                id="staff-code"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="1001"
              />
            </>
          ) : (
            <>
              <label htmlFor="worker-name">Who is working this shift?</label>
              <input
                id="worker-name"
                autoFocus
                value={workerName}
                onChange={(event) => setWorkerName(event.target.value)}
                placeholder="First name"
              />
              <button type="button" className="text-button" onClick={() => setPendingUser(null)}>
                Use another code
              </button>
            </>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary-button">Log in</button>
        </form>
      </section>
    </main>
  );
}

function TopBar({ user, selectedShift, onBack, onLogout }) {
  const shiftLabel = selectedShift === 'manager'
    ? 'Manager dashboard'
    : shiftOptions.find((shift) => shift.id === selectedShift)?.label || 'Select shift';
  return (
    <header className="top-bar">
      <div className="top-user">
        <strong>{user.name}</strong>
        <span>{user.role}</span>
      </div>
      <div className="top-actions">
        {selectedShift && <span className="shift-pill">{shiftLabel}</span>}
        {selectedShift && <button type="button" className="ghost-button" onClick={onBack}>Change shift</button>}
        <button type="button" className="ghost-button" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}

function ShiftPicker({ user, onSelect, onManager }) {
  return (
    <main className="page">
      <section className="intro">
        <p className="eyebrow">Today</p>
        <h1>Choose a shift</h1>
      </section>
      <section className="shift-grid">
        {shiftOptions.map((shift) => (
          <button key={shift.id} className="shift-card" type="button" onClick={() => onSelect(shift.id)}>
            <span>{shift.label}</span>
            <small>Open</small>
          </button>
        ))}
        {user.isManager && (
          <button className="shift-card manager-card" type="button" onClick={onManager}>
            <span>Manager dashboard</span>
            <small>Reports</small>
          </button>
        )}
      </section>
    </main>
  );
}

function TaskInput({ task, value, onChange }) {
  if (!taskNeedsInput(task)) return null;
  if (task.inputType === 'yesno') {
    return (
      <div className="choice-row">
        {['Yes', 'No'].map((choice) => (
          <button
            key={choice}
            type="button"
            className={value === choice ? 'active' : ''}
            onClick={() => onChange(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
    );
  }
  if (task.inputType === 'number') {
    return <input type="number" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter number" />;
  }
  if (task.inputType === 'text') {
    return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Add text" />;
  }
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Add comment" rows="3" />;
}

function HandoverNotes({ user, shiftType, notes, setNotes }) {
  const [savedAt, setSavedAt] = useState('');
  const date = todayKey();
  const key = `${date}-${shiftType}-${user.name}`;
  const value = notes[key] || {
    date,
    shiftType,
    completedBy: user.name,
    nextShift: '',
    lowStock: '',
    maintenance: '',
    memberEvent: '',
    updatedAt: '',
  };

  function update(field, fieldValue) {
    const next = {
      ...value,
      [field]: fieldValue,
      updatedAt: new Date().toISOString(),
    };
    const nextNotes = { ...notes, [key]: next };
    setNotes(nextNotes);
    saveStorage(HANDOVER_KEY, nextNotes);
    setSavedAt('Saved just now');
  }

  return (
    <section className="handover-panel" id="handover-notes">
      <div className="section-heading static-heading">
        <p className="eyebrow">Handover</p>
        <h2>Handover notes</h2>
        <span>{savedAt || (value.updatedAt ? `Saved ${formatDateTime(value.updatedAt)}` : 'Auto-saves while you type')}</span>
      </div>
      <label>
        Notes for next shift
        <textarea rows="3" value={value.nextShift} onChange={(event) => update('nextShift', event.target.value)} />
      </label>
      <label>
        Low stock / order soon
        <textarea rows="2" value={value.lowStock} onChange={(event) => update('lowStock', event.target.value)} />
      </label>
      <label>
        Maintenance or issues
        <textarea rows="2" value={value.maintenance} onChange={(event) => update('maintenance', event.target.value)} />
      </label>
      <label>
        Member or event notes
        <textarea rows="2" value={value.memberEvent} onChange={(event) => update('memberEvent', event.target.value)} />
      </label>
    </section>
  );
}

function Checklist({ user, shiftType, routines, logs, setLogs, handoverNotes, setHandoverNotes }) {
  const [drafts, setDrafts] = useState({});
  const [comments, setComments] = useState({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const [taskFilter, setTaskFilter] = useState('all');
  const date = todayKey();
  const tasks = useMemo(() => flattenTasks(routines, shiftType, date), [routines, shiftType, date]);
  const handoverKey = `${date}-${shiftType}-${user.name}`;
  const currentHandover = handoverNotes[handoverKey];
  const hasHandover = handoverHasContent(currentHandover);
  const logsByTask = Object.fromEntries(logs.filter((log) => log.date === date).map((log) => [log.taskId, log]));
  const doneCount = tasks.filter((task) => logsByTask[task.id]?.status === 'done').length;
  const notRelevantCount = tasks.filter((task) => logsByTask[task.id]?.status === 'not_relevant').length;
  const handledCount = doneCount + notRelevantCount;
  const criticalRemaining = tasks.filter((task) => task.priority === 'critical' && !isHandled(logsByTask[task.id])).length;
  const importantRemaining = tasks.filter((task) => task.priority === 'important' && !isHandled(logsByTask[task.id])).length;
  const missingCount = Math.max(tasks.length - handledCount, 0);
  const securityRemaining = tasks.filter((task) => ['security', 'salto', 'cornerbar'].includes(task.area) && !isHandled(logsByTask[task.id])).length;
  const posRemaining = tasks.filter((task) => task.area === 'pos' && !isHandled(logsByTask[task.id])).length;
  const visibleTasks = tasks.filter((task) => {
    const log = logsByTask[task.id];
    if (hideCompleted && isHandled(log)) return false;
    if (taskFilter === 'critical') return task.priority === 'critical';
    if (taskFilter === 'priority') return ['critical', 'important'].includes(task.priority);
    if (taskFilter === 'needsInput') return taskNeedsInput(task) || task.requiresComment;
    return true;
  });
  const grouped = groupBy(visibleTasks, (task) => task.section);
  const allGrouped = groupBy(tasks, (task) => task.section);

  function saveTaskStatus(task, status) {
    const input = drafts[task.id] || '';
    const comment = comments[task.id] || '';
    if (status === 'done' && task.requiresComment && !comment.trim()) {
      alert('This task requires a comment before saving.');
      return;
    }
    if (status === 'not_relevant' && ['important', 'critical'].includes(task.priority) && !comment.trim()) {
      alert(`Please add a reason before marking this ${task.priority} task as not relevant.`);
      return;
    }
    if (status === 'done' && task.criticalConfirm) {
      const confirmed = window.confirm(criticalConfirmMessage(task));
      if (!confirmed) return;
    }

    const nextLog = {
      id: `${date}-${task.id}`,
      taskId: task.id,
      taskTitle: task.title,
      date,
      completedBy: user.name,
      staffRole: user.role,
      shiftType: task.shiftType,
      section: task.section,
      timeBlock: task.timeBlock,
      area: task.area,
      priority: task.priority,
      inputType: task.inputType,
      input,
      comment,
      status,
      completedAt: new Date().toISOString(),
    };
    const nextLogs = logs.filter((log) => !(log.date === date && log.taskId === task.id));
    const savedLogs = [...nextLogs, nextLog];
    setLogs(savedLogs);
    saveStorage(LOG_KEY, savedLogs);
  }

  function clearTask(task) {
    const nextLogs = logs.filter((log) => !(log.date === date && log.taskId === task.id));
    setLogs(nextLogs);
    saveStorage(LOG_KEY, nextLogs);
  }

  if (shiftType === 'guides') {
    return (
      <main className="page">
        <section className="intro compact">
          <p className="eyebrow">Guides</p>
          <h1>Knowledge base</h1>
        </section>
        <section className="guide-list">
          {knowledgeBase.map((guide) => (
            <article key={guide.title} className="guide-card">
              <h2>{guide.title}</h2>
              <p>{guide.body}</p>
            </article>
          ))}
        </section>
      </main>
    );
  }

  return (
    <main className="page checklist-page">
      <section className="progress-panel">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString()}</p>
          <h1>{handledCount}/{tasks.length} handled</h1>
        </div>
        <div className="progress-track">
          <span style={{ width: `${tasks.length ? (handledCount / tasks.length) * 100 : 0}%` }} />
        </div>
        <div className="progress-breakdown">
          <span>{doneCount} done</span>
          <span>{notRelevantCount} not relevant</span>
          <span>{criticalRemaining} critical left</span>
          <span>{importantRemaining} important left</span>
        </div>
        {criticalRemaining > 0 ? (
          <p className="critical-warning">{criticalRemaining} critical {criticalRemaining === 1 ? 'task is' : 'tasks are'} still incomplete.</p>
        ) : (
          <p className="all-clear">All critical tasks are handled.</p>
        )}
        {user.baseName?.startsWith('Time2Staff') && (
          <p className="identity-reminder">You are logged as {user.name}.</p>
        )}
        {shiftType === 'closing' && (
          <section className="readiness-card">
            <strong>
              Closing readiness: {criticalRemaining > 0 ? `${criticalRemaining} critical tasks remaining` : 'critical tasks handled'}
            </strong>
            <span>{securityRemaining} security | {posRemaining} register/POS | handover {hasHandover ? 'present' : 'missing'}</span>
          </section>
        )}
        <a className="handover-jump" href="#handover-notes">Jump to handover notes</a>
        <div className="checklist-controls">
          <label className="toggle-row">
            <input type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.target.checked)} />
            Hide handled
          </label>
          <label>
            Filter
            <select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="critical">Critical only</option>
              <option value="priority">Important + critical</option>
              <option value="needsInput">Needs input/comment</option>
            </select>
          </label>
        </div>
      </section>

      {Object.entries(grouped).map(([section, sectionTasks]) => (
        <section key={section} className={`task-section ${section.toLowerCase().includes('critical final') ? 'final-checks-section' : ''}`}>
          <div className="section-heading">
            <p className="eyebrow">{section.toLowerCase().includes('critical final') ? 'Final checks' : 'Time block'}</p>
            <h2>{section}</h2>
            <span>
              {allGrouped[section].filter((task) => isHandled(logsByTask[task.id])).length}/{allGrouped[section].length} handled
              {' | '}
              {allGrouped[section].filter((task) => task.priority === 'critical' && !isHandled(logsByTask[task.id])).length} critical remaining
            </span>
          </div>
          {sectionTasks.map((task) => {
            const log = logsByTask[task.id];
            const handled = isHandled(log);
            return (
              <article key={task.id} className={`task-card priority-${task.priority} status-${log?.status || 'missing'}`}>
                <div className="task-main">
                  <div className="checkbox">{log?.status === 'done' ? 'OK' : log?.status === 'not_relevant' ? 'N/A' : ''}</div>
                  <div>
                    <div className="task-title-row">
                      <strong>{task.title}</strong>
                      <span className={`priority-badge ${task.priority}`}>{priorityLabels[task.priority]}</span>
                    </div>
                    {task.description && <small>{task.description}</small>}
                    <div className="task-labels">
                      <span>{task.area}</span>
                      <span>{task.timeBlock}</span>
                      {task.requiresComment && <span>Comment required</span>}
                    </div>
                  </div>
                </div>

                {!handled && (
                  <div className="task-inputs">
                    {taskNeedsInput(task) && task.inputType !== 'comment' && (
                      <TaskInput
                        task={task}
                        value={drafts[task.id] || ''}
                        onChange={(value) => setDrafts((current) => ({ ...current, [task.id]: value }))}
                      />
                    )}
                    {(task.requiresComment || task.inputType === 'comment') ? (
                      <textarea
                        rows="2"
                        value={comments[task.id] || drafts[task.id] || ''}
                        onChange={(event) => {
                          setComments((current) => ({ ...current, [task.id]: event.target.value }));
                          if (task.inputType === 'comment') {
                            setDrafts((current) => ({ ...current, [task.id]: event.target.value }));
                          }
                        }}
                        placeholder={task.requiresComment ? 'Required reason or comment' : 'Add note if needed'}
                      />
                    ) : (
                      <details className="optional-note">
                        <summary>Add note / reason</summary>
                        <textarea
                          rows="2"
                          value={comments[task.id] || ''}
                          onChange={(event) => setComments((current) => ({ ...current, [task.id]: event.target.value }))}
                          placeholder="Optional note or not relevant reason"
                        />
                      </details>
                    )}
                  </div>
                )}

                {handled && (
                  <div className="completion-box">
                    <strong>{log.status === 'done' ? 'Done' : 'Not relevant'}</strong>
                    <span>{log.completedBy} | {formatDateTime(log.completedAt)}</span>
                    {log.input && <p>Input: {log.input}</p>}
                    {log.comment && <p>Comment: {log.comment}</p>}
                  </div>
                )}

                <div className="task-actions">
                  {!handled ? (
                    <>
                      <button type="button" className="primary-button compact-button" onClick={() => saveTaskStatus(task, 'done')}>
                        Done
                      </button>
                      <button type="button" className="ghost-button compact-button" onClick={() => saveTaskStatus(task, 'not_relevant')}>
                        Not relevant
                      </button>
                    </>
                  ) : (
                    <button type="button" className="ghost-button compact-button" onClick={() => clearTask(task)}>
                      Change status
                    </button>
                  )}
                  {!handled && <span className="save-as">Will save as {user.name}</span>}
                </div>
              </article>
            );
          })}
        </section>
      ))}

      {visibleTasks.length === 0 && (
        <section className="empty-state">
          <h2>No tasks in this view</h2>
          <p className="muted">Adjust the filters to show more checklist items.</p>
        </section>
      )}

      <HandoverNotes user={user} shiftType={shiftType} notes={handoverNotes} setNotes={setHandoverNotes} />

      <section className="end-shift-summary">
        <div className="section-heading static-heading">
          <p className="eyebrow">Review</p>
          <h2>End shift summary</h2>
          <span>{hasHandover ? 'Handover notes present' : 'Handover notes missing'}</span>
        </div>
        <div className="summary-metrics">
          <span>Done {doneCount}</span>
          <span>Not relevant {notRelevantCount}</span>
          <span>Missing {missingCount}</span>
          <span>Critical missing {criticalRemaining}</span>
        </div>
        {criticalRemaining > 0 ? (
          <p className="critical-warning">Critical tasks still missing. Review before leaving.</p>
        ) : (
          <p className="all-clear">No critical tasks missing.</p>
        )}
      </section>
    </main>
  );
}

function ManagerDashboard({ routines, setRoutines, logs, setLogs, handoverNotes, setHandoverNotes, onResetPilotNotice }) {
  const [date, setDate] = useState(todayKey());
  const [staffFilter, setStaffFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [showAllCritical, setShowAllCritical] = useState(false);
  const [editorTask, setEditorTask] = useState(blankTask);
  const [message, setMessage] = useState('');
  const [clearPhrase, setClearPhrase] = useState('');
  const [lastExportAt, setLastExportAt] = useState(() => readStorage(LAST_EXPORT_KEY, ''));

  const activeShifts = shiftOptions.filter((shift) => shift.id !== 'guides');
  const allTasks = activeShifts.flatMap((shift) => flattenTasks(routines, shift.id, date));
  const visibleTasks = allTasks.filter((task) => shiftFilter === 'all' || task.shiftType === shiftFilter);
  const dateLogs = logs.filter((log) => log.date === date);
  const filteredLogs = dateLogs.filter((log) => {
    const staffMatch = staffFilter === 'all' || log.completedBy === staffFilter;
    const shiftMatch = shiftFilter === 'all' || log.shiftType === shiftFilter;
    return staffMatch && shiftMatch;
  });
  const handledIds = new Set(dateLogs.filter(isHandled).map((log) => log.taskId));
  const missingTasks = visibleTasks.filter((task) => !handledIds.has(task.id));
  const criticalMissing = missingTasks.filter((task) => task.priority === 'critical');
  const visibleCritical = visibleTasks.filter((task) => task.priority === 'critical');
  const criticalPanelTasks = showAllCritical ? visibleCritical : criticalMissing;
  const criticalGroups = groupBy(criticalPanelTasks, (task) => task.shiftType);
  const missingGroups = groupBy(missingTasks, (task) => `${task.shiftType}__${task.section}`);
  const commentLogs = filteredLogs.filter((log) => log.comment);
  const inputDeviationLogs = filteredLogs.filter(hasDeviation);
  const time2StaffLogs = filteredLogs.filter((log) => log.completedBy.includes('Time2Staff'));
  const notRelevantLogs = filteredLogs.filter((log) => log.status === 'not_relevant');
  const staffNames = [...new Set(logs.map((log) => log.completedBy))].sort();
  const dates = [...new Set(logs.map((log) => log.date))].sort().reverse();
  const visibleHandovers = Object.values(handoverNotes).filter((note) => {
    if (note.date !== date) return false;
    if (shiftFilter !== 'all' && note.shiftType !== shiftFilter) return false;
    if (staffFilter !== 'all' && note.completedBy !== staffFilter) return false;
    return [note.nextShift, note.lowStock, note.maintenance, note.memberEvent].some(Boolean);
  });
  const handoverGroups = groupBy(visibleHandovers, (note) => note.shiftType);
  const allHandoversWithContent = Object.values(handoverNotes).filter(handoverHasContent);
  const loggedDates = [...new Set([...logs.map((log) => log.date), ...allHandoversWithContent.map((note) => note.date)])].length;
  const handledRecords = logs.filter(isHandled).length;
  const usingDefaultRoutines = routinesUseDefaults(routines);
  const attentionItems = [
    ...criticalMissing.slice(0, 4).map((task) => ({
      id: task.id,
      title: task.title,
      detail: `${shiftLabels[task.shiftType]} | ${task.section}`,
      type: 'Critical missing',
    })),
    ...notRelevantLogs.slice(0, 3).map((log) => ({
      id: `${log.id}-na`,
      title: log.taskTitle,
      detail: `${log.completedBy}: ${log.comment || 'No reason added'}`,
      type: 'Not relevant',
    })),
    ...inputDeviationLogs.slice(0, 3).map((log) => ({
      id: `${log.id}-input`,
      title: log.taskTitle,
      detail: `${log.inputType}: ${log.input || log.comment}`,
      type: 'Input/deviation',
    })),
    ...time2StaffLogs.slice(0, 2).map((log) => ({
      id: `${log.id}-t2s`,
      title: log.taskTitle,
      detail: `${log.completedBy} | ${shiftLabels[log.shiftType]}`,
      type: 'Time2Staff',
    })),
    ...visibleHandovers.slice(0, 3).map((note) => ({
      id: `${note.date}-${note.shiftType}-${note.completedBy}`,
      title: `${shiftLabels[note.shiftType]} handover`,
      detail: note.completedBy,
      type: 'Handover',
    })),
  ];

  function buildDailyReport() {
    const lines = [
      'Mesh Shift Log - Daily report',
      `Date: ${date}`,
      '',
    ];
    activeShifts.forEach((shift) => {
      const shiftTasks = flattenTasks(routines, shift.id, date);
      const shiftLogs = dateLogs.filter((log) => log.shiftType === shift.id);
      const done = shiftLogs.filter((log) => log.status === 'done').length;
      const notRelevant = shiftLogs.filter((log) => log.status === 'not_relevant').length;
      const handled = done + notRelevant;
      const missing = Math.max(shiftTasks.length - handled, 0);
      const criticalMissingCount = shiftTasks.filter((task) => task.priority === 'critical' && !handledIds.has(task.id)).length;
      const staff = [...new Set(shiftLogs.map((log) => log.completedBy))];
      const shiftHandovers = visibleHandovers.filter((note) => note.shiftType === shift.id);
      if (handled === 0 && shiftHandovers.length === 0 && missing === shiftTasks.length) return;
      lines.push(shift.label);
      lines.push(`Handled: ${handled} / ${shiftTasks.length}`);
      lines.push(`Done: ${done}`);
      lines.push(`Not relevant: ${notRelevant}`);
      lines.push(`Missing: ${missing}`);
      lines.push(`Critical missing: ${criticalMissingCount}`);
      lines.push(`Staff: ${staff.length ? staff.join(', ') : 'None logged'}`);
      if (shiftHandovers.length) {
        lines.push('');
        lines.push('Handover:');
        shiftHandovers.forEach((note) => {
          lines.push(`- ${note.completedBy}`);
          if (note.nextShift) lines.push(`  Next shift: ${note.nextShift}`);
          if (note.lowStock) lines.push(`  Low stock: ${note.lowStock}`);
          if (note.maintenance) lines.push(`  Maintenance: ${note.maintenance}`);
          if (note.memberEvent) lines.push(`  Member/event: ${note.memberEvent}`);
        });
      }
      const shiftAttention = shiftLogs.filter((log) => log.status === 'not_relevant' || log.comment || log.input);
      if (shiftAttention.length) {
        lines.push('');
        lines.push('Attention:');
        shiftAttention.forEach((log) => {
          const detail = log.comment || log.input || log.status;
          lines.push(`- ${log.taskTitle}: ${detail}`);
        });
      }
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  function progressForShift(shiftType) {
    const shiftTasks = flattenTasks(routines, shiftType, date);
    const shiftLogs = dateLogs.filter((log) => log.shiftType === shiftType);
    const done = shiftLogs.filter((log) => log.status === 'done').length;
    const notRelevant = shiftLogs.filter((log) => log.status === 'not_relevant').length;
    const handled = done + notRelevant;
    const missing = Math.max(shiftTasks.length - handled, 0);
    const criticalMissingCount = shiftTasks.filter((task) => task.priority === 'critical' && !handledIds.has(task.id)).length;
    return { done, notRelevant, missing, criticalMissing: criticalMissingCount, total: shiftTasks.length };
  }

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      logs,
      routines,
      handoverNotes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mesh-shift-log-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    const exportedAt = new Date().toISOString();
    setLastExportAt(exportedAt);
    saveStorage(LAST_EXPORT_KEY, exportedAt);
    setMessage('Backup exported.');
  }

  function clearTestLogs() {
    if (clearPhrase !== 'CLEAR') {
      setMessage('Type CLEAR to confirm clearing test logs.');
      return;
    }
    const confirmed = window.confirm(
      'This clears local shift logs and handover notes from this browser only. Routine setup will stay. Export a backup first if needed.',
    );
    if (!confirmed) return;
    setLogs([]);
    setHandoverNotes({});
    saveStorage(LOG_KEY, []);
    saveStorage(HANDOVER_KEY, {});
    setClearPhrase('');
    setMessage('Test logs cleared from this browser.');
  }

  async function copyDailyReport() {
    const report = buildDailyReport();
    try {
      await navigator.clipboard.writeText(report);
      setMessage('Daily report copied.');
    } catch {
      setMessage('Could not copy automatically. Select the report text below and copy it manually.');
    }
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.logs && !Array.isArray(data.logs)) throw new Error('Logs must be an array.');
        if (data.routines && !Array.isArray(data.routines)) throw new Error('Routines must be an array.');
        if (data.logs) {
          const normalizedLogs = normalizeLogs(data.logs);
          setLogs(normalizedLogs);
          saveStorage(LOG_KEY, normalizedLogs);
        }
        if (data.routines) {
          validateRoutineImport(data.routines);
          const normalized = normalizeRoutines(data.routines);
          setRoutines(normalized);
          saveStorage(ROUTINE_KEY, normalized);
        }
        if (data.handoverNotes) {
          validateHandoverImport(data.handoverNotes);
          const normalizedNotes = normalizeHandovers(data.handoverNotes);
          setHandoverNotes(normalizedNotes);
          saveStorage(HANDOVER_KEY, normalizedNotes);
        }
        setMessage('Import complete.');
      } catch (error) {
        setMessage(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function exportRoutines() {
    const blob = new Blob([JSON.stringify(routines, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mesh-routines-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Routines exported.');
  }

  function importRoutines(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        validateRoutineImport(data);
        const normalized = normalizeRoutines(data);
        setRoutines(normalized);
        saveStorage(ROUTINE_KEY, normalized);
        setMessage('Routines imported.');
      } catch (error) {
        setMessage(`Routine import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function saveEditorTask(event) {
    event.preventDefault();
    if (!editorTask.title.trim()) {
      setMessage('Task title is required.');
      return;
    }
    const sectionId = `${editorTask.shiftType}-${slug(editorTask.section || editorTask.timeBlock || 'custom')}`;
    const task = normalizeRoutineTask({
      ...editorTask,
      id: editorTask.id || `${sectionId}-${slug(editorTask.title)}`,
      section: editorTask.section || editorTask.timeBlock,
      timeBlock: editorTask.timeBlock || editorTask.section,
    });
    const current = normalizeRoutines(routines)
      .map((routine) => ({
        ...routine,
        tasks: routine.tasks.filter((item) => item.id !== task.id),
      }))
      .filter((routine) => routine.tasks.length > 0 || routine.id === sectionId);
    const sectionIndex = current.findIndex((routine) => routine.id === sectionId);
    let next;
    if (sectionIndex >= 0) {
      next = current.map((routine, index) => {
        if (index !== sectionIndex) return routine;
        return { ...routine, label: task.section, timeBlock: task.timeBlock, tasks: [...routine.tasks, task] };
      });
    } else {
      next = [
        ...current,
        {
          id: sectionId,
          shiftType: task.shiftType,
          label: task.section,
          timeBlock: task.timeBlock,
          tasks: [task],
        },
      ];
    }
    setRoutines(next);
    saveStorage(ROUTINE_KEY, next);
    setEditorTask(blankTask);
    setMessage('Routine task saved.');
  }

  function editTask(task) {
    setEditorTask(task);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function deactivateTask(task) {
    const next = normalizeRoutines(routines).map((routine) => ({
      ...routine,
      tasks: routine.tasks.map((item) => (item.id === task.id ? { ...item, active: false } : item)),
    }));
    setRoutines(next);
    saveStorage(ROUTINE_KEY, next);
    setMessage('Task deactivated.');
  }

  return (
    <main className="page manager-page">
      <section className="intro compact">
        <p className="eyebrow">Manager</p>
        <h1>Dashboard</h1>
      </section>

      {message && <p className="status-message">{message}</p>}

      <section className="manager-controls">
        <label>
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          Staff
          <select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}>
            <option value="all">All staff</option>
            {staffNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>
          Shift
          <select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}>
            <option value="all">All shifts</option>
            {activeShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.label}</option>)}
          </select>
        </label>
      </section>

      <section className="local-status-card">
        <div>
          <p className="eyebrow">Pilot data</p>
          <h2>Local data status</h2>
          <p className="muted">Saved in this browser on this device.</p>
        </div>
        <div className="status-grid">
          <span><strong>{loggedDates}</strong> logged dates</span>
          <span><strong>{handledRecords}</strong> handled records</span>
          <span><strong>{allHandoversWithContent.length}</strong> handover notes</span>
          <span><strong>{usingDefaultRoutines ? 'Default' : 'Local edits'}</strong> routines</span>
        </div>
        <p className="muted">
          {lastExportAt ? `Last backup: ${formatDateTime(lastExportAt)}` : 'No backup exported yet.'}
        </p>
        <div className="backup-actions">
          <button type="button" className="primary-button compact-button" onClick={exportData}>Export backup</button>
          <button type="button" className="ghost-button compact-button" onClick={onResetPilotNotice}>Show pilot notice again</button>
        </div>
      </section>

      <section className="summary-grid">
        {activeShifts.map((shift) => {
          const progress = progressForShift(shift.id);
          const handled = progress.done + progress.notRelevant;
          const percent = progress.total ? (handled / progress.total) * 100 : 0;
          return (
            <article key={shift.id} className="summary-card">
              <span>{shift.label}</span>
              <strong>{handled}/{progress.total}</strong>
              <small>Done {progress.done} | N/A {progress.notRelevant}</small>
              <small>Missing {progress.missing} | Critical {progress.criticalMissing}</small>
              <div className="mini-progress" aria-label={`${shift.label} progress`}>
                <i style={{ width: `${percent}%` }} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="critical-panel">
        <div className="panel-title-row">
          <h2>{showAllCritical ? 'All critical tasks' : 'Critical missing'}</h2>
          <label className="toggle-row small-toggle">
            <input type="checkbox" checked={showAllCritical} onChange={(event) => setShowAllCritical(event.target.checked)} />
            Show all critical tasks
          </label>
        </div>
        {criticalPanelTasks.length === 0 && <p className="muted">No critical tasks need attention for this filter.</p>}
        {Object.entries(criticalGroups).map(([shiftType, tasksForShift]) => (
          <div key={shiftType} className="critical-group">
            {shiftFilter === 'all' && <h3>{shiftLabels[shiftType] || shiftType}</h3>}
            {tasksForShift.map((task) => {
              const log = getTaskLog(dateLogs, date, task.id);
              return (
                <p key={task.id}>
                  {task.title}
                  <span>{task.section}{log ? ` | ${log.status} by ${log.completedBy}` : ''}</span>
                </p>
              );
            })}
          </div>
        ))}
      </section>

      <section className="attention-panel">
        <h2>Needs attention</h2>
        <div className="attention-grid">
          <article><strong>{criticalMissing.length}</strong><span>Incomplete critical</span></article>
          <article><strong>{commentLogs.length}</strong><span>With comments</span></article>
          <article><strong>{inputDeviationLogs.length}</strong><span>Inputs or deviations</span></article>
          <article><strong>{notRelevantLogs.length}</strong><span>Not relevant</span></article>
        </div>
        {attentionItems.length === 0 && <p className="muted">All clear for this filter/date.</p>}
        {attentionItems.map((item) => (
          <p key={item.id} className="attention-line">
            <small>{item.type}</small>
            {item.title}
            <span>{item.detail}</span>
          </p>
        ))}
      </section>

      <section className="daily-report-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Report</p>
            <h2>Daily report</h2>
          </div>
          <button type="button" className="primary-button compact-button" onClick={copyDailyReport}>Copy daily report</button>
        </div>
        <pre>{buildDailyReport()}</pre>
      </section>

      <section className="manager-list">
        <h2>Handover notes</h2>
        {visibleHandovers.length === 0 && <p className="muted">No handover notes for this date/filter.</p>}
        {Object.entries(handoverGroups).map(([shiftType, notes]) => (
          <div key={shiftType} className="handover-group">
            <h3>{shiftLabels[shiftType]}</h3>
            {notes.map((note) => (
              <article key={`${note.date}-${note.shiftType}-${note.completedBy}`} className="log-row">
                <strong>{note.completedBy}</strong>
                <span>{formatDateTime(note.updatedAt)}</span>
                {note.nextShift && <small>Next shift: {note.nextShift}</small>}
                {note.lowStock && <small>Low stock: {note.lowStock}</small>}
                {note.maintenance && <small>Maintenance: {note.maintenance}</small>}
                {note.memberEvent && <small>Member/event: {note.memberEvent}</small>}
              </article>
            ))}
          </div>
        ))}
      </section>

      <section className="manager-list">
        <h2>Completed and handled tasks</h2>
        {filteredLogs.length === 0 && <p className="muted">No completed tasks yet for this filter.</p>}
        {filteredLogs.map((log) => (
          <article key={log.id} className={`log-row priority-${log.priority}`}>
            <strong>{log.taskTitle}</strong>
            <span>{log.completedBy} | {formatDateTime(log.completedAt)} | {shiftLabels[log.shiftType] || log.shiftType}</span>
            <small>{log.status === 'not_relevant' ? 'Not relevant' : 'Done'} | {log.section}</small>
            {log.input && <small>Input: {log.input}</small>}
            {log.comment && <small>Comment: {log.comment}</small>}
          </article>
        ))}
      </section>

      <section className="manager-list">
        <h2>Missing tasks</h2>
        {missingTasks.length === 0 && <p className="muted">No missing tasks for this filter.</p>}
        {Object.entries(missingGroups).map(([key, tasksForGroup]) => {
          const [shiftType, section] = key.split('__');
          return (
            <div key={key} className="missing-group">
              <h3>{shiftLabels[shiftType]} | {section}</h3>
              {tasksForGroup.map((task) => (
                <article key={task.id} className={`log-row priority-${task.priority}`}>
                  <strong>{task.title}</strong>
                  <span>{task.area} | {priorityLabels[task.priority]}</span>
                </article>
              ))}
            </div>
          );
        })}
      </section>

      <section className="history-panel">
        <h2>History by date</h2>
        <div className="date-chips">
          {[todayKey(), ...dates.filter((entry) => entry !== todayKey())].slice(0, 14).map((entry) => (
            <button key={entry} type="button" onClick={() => setDate(entry)} className={entry === date ? 'active' : ''}>
              {entry}
            </button>
          ))}
        </div>
      </section>

      <section className="backup-panel">
        <h2>Backup</h2>
        <p className="muted">Export backs up logs and imported routine edits from this browser.</p>
        <div className="backup-actions">
          <button type="button" className="primary-button" onClick={exportData}>Export JSON</button>
          <label className="file-button">
            Import JSON
            <input type="file" accept="application/json" onChange={importData} />
          </label>
        </div>
      </section>

      <section className="danger-zone">
        <p className="eyebrow">Pilot reset</p>
        <h2>Clear test logs</h2>
        <p className="muted">
          Clears local shift logs and handover notes from this browser only. Routine setup will stay.
        </p>
        <label>
          Type CLEAR to confirm
          <input value={clearPhrase} onChange={(event) => setClearPhrase(event.target.value)} placeholder="CLEAR" />
        </label>
        <button type="button" className="ghost-button compact-button" onClick={clearTestLogs}>Clear test logs</button>
      </section>

      <section className="routine-editor">
        <div className="panel-title-row">
          <h2>Routine editor</h2>
          <div className="backup-actions">
            <button type="button" className="ghost-button compact-button" onClick={exportRoutines}>Export routines</button>
            <label className="file-button compact-file">
              Import routines
              <input type="file" accept="application/json" onChange={importRoutines} />
            </label>
          </div>
        </div>

        <div className="routine-task-list">
          {normalizeRoutines(routines).flatMap((routine) => routine.tasks).map((task) => (
            <article key={task.id} className={`log-row priority-${task.priority} ${task.active === false ? 'inactive-task' : ''}`}>
              <strong>{task.title}</strong>
              <span>{shiftLabels[task.shiftType]} | {task.section} | {priorityLabels[task.priority]} | {task.active === false ? 'Inactive' : 'Active'}</span>
              <small>{task.area}</small>
              <div className="inline-actions">
                <button type="button" className="ghost-button compact-button" onClick={() => editTask(task)}>Edit</button>
                {task.active !== false && (
                  <button type="button" className="ghost-button compact-button" onClick={() => deactivateTask(task)}>Deactivate task</button>
                )}
              </div>
            </article>
          ))}
        </div>

        <form className="editor-form" onSubmit={saveEditorTask}>
          <label>
            Title
            <input value={editorTask.title} onChange={(event) => setEditorTask((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            Description
            <textarea rows="2" value={editorTask.description} onChange={(event) => setEditorTask((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label>
            Shift type
            <select value={editorTask.shiftType} onChange={(event) => setEditorTask((current) => ({ ...current, shiftType: event.target.value }))}>
              {activeShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.label}</option>)}
            </select>
          </label>
          <label>
            Section
            <input value={editorTask.section} onChange={(event) => setEditorTask((current) => ({ ...current, section: event.target.value, timeBlock: event.target.value }))} />
          </label>
          <label>
            Area
            <select value={editorTask.area} onChange={(event) => setEditorTask((current) => ({ ...current, area: event.target.value }))}>
              {areas.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={editorTask.priority} onChange={(event) => setEditorTask((current) => ({ ...current, priority: event.target.value }))}>
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>
            Input type
            <select value={editorTask.inputType} onChange={(event) => setEditorTask((current) => ({ ...current, inputType: event.target.value }))}>
              <option value="none">None</option>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="yesno">Yes/no</option>
              <option value="comment">Comment</option>
            </select>
          </label>
          <label className="toggle-row"><input type="checkbox" checked={editorTask.active} onChange={(event) => setEditorTask((current) => ({ ...current, active: event.target.checked }))} /> Active</label>
          <label className="toggle-row"><input type="checkbox" checked={editorTask.criticalConfirm} onChange={(event) => setEditorTask((current) => ({ ...current, criticalConfirm: event.target.checked }))} /> Critical confirmation</label>
          <label className="toggle-row"><input type="checkbox" checked={editorTask.requiresComment} onChange={(event) => setEditorTask((current) => ({ ...current, requiresComment: event.target.checked }))} /> Requires comment</label>
          <button type="submit" className="primary-button">{editorTask.id ? 'Save changes' : 'Add task'}</button>
          <button type="button" className="ghost-button" onClick={() => setEditorTask(blankTask)}>Cancel</button>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(() => readStorage(SESSION_KEY, null));
  const [selectedShift, setSelectedShift] = useState(null);
  const [showManager, setShowManager] = useState(false);
  const [logs, setLogs] = useState(() => normalizeLogs(readStorage(LOG_KEY, [])));
  const [routines, setRoutines] = useState(() => normalizeRoutines(readStorage(ROUTINE_KEY, defaultRoutines)));
  const [handoverNotes, setHandoverNotes] = useState(() => normalizeHandovers(readStorage(HANDOVER_KEY, {})));
  const [pilotAccepted, setPilotAccepted] = useState(() => readStorage(PILOT_NOTICE_KEY, false));

  useEffect(() => saveStorage(LOG_KEY, logs), [logs]);
  useEffect(() => saveStorage(ROUTINE_KEY, routines), [routines]);
  useEffect(() => saveStorage(HANDOVER_KEY, handoverNotes), [handoverNotes]);

  if (!user) {
    return (
      <>
        <Login onLogin={setUser} />
        {!pilotAccepted && (
          <PilotNotice
            onAccept={() => {
              saveStorage(PILOT_NOTICE_KEY, true);
              setPilotAccepted(true);
            }}
          />
        )}
      </>
    );
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setSelectedShift(null);
    setShowManager(false);
  }

  return (
    <>
      <TopBar
        user={user}
        selectedShift={showManager ? 'manager' : selectedShift}
        onBack={() => {
          setSelectedShift(null);
          setShowManager(false);
        }}
        onLogout={logout}
      />
      {!selectedShift && !showManager && (
        <ShiftPicker user={user} onSelect={setSelectedShift} onManager={() => setShowManager(true)} />
      )}
      {selectedShift && !showManager && (
        <Checklist
          user={user}
          shiftType={selectedShift}
          routines={routines}
          logs={logs}
          setLogs={setLogs}
          handoverNotes={handoverNotes}
          setHandoverNotes={setHandoverNotes}
        />
      )}
      {showManager && user.isManager && (
        <ManagerDashboard
          routines={routines}
          setRoutines={setRoutines}
          logs={logs}
          setLogs={setLogs}
          handoverNotes={handoverNotes}
          setHandoverNotes={setHandoverNotes}
          onResetPilotNotice={() => {
            localStorage.removeItem(PILOT_NOTICE_KEY);
            setPilotAccepted(false);
          }}
        />
      )}
      {!pilotAccepted && (
        <PilotNotice
          onAccept={() => {
            saveStorage(PILOT_NOTICE_KEY, true);
            setPilotAccepted(true);
          }}
        />
      )}
    </>
  );
}
