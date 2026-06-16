import { useEffect, useMemo, useState } from 'react';
import { defaultRoutines, knowledgeBase, shiftOptions, staffCodes } from './data/routines.js';

const LOG_KEY = 'mesh-shift-logs-v1';
const ROUTINE_KEY = 'mesh-routines-v1';
const SESSION_KEY = 'mesh-current-user-v1';

const priorityLabels = {
  normal: 'Normal',
  important: 'Important',
  critical: 'Critical',
};

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeStamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

function flattenTasks(routines, shiftType) {
  return routines
    .filter((section) => section.shiftType === shiftType)
    .flatMap((section) =>
      section.tasks.map((task) => ({
        ...task,
        sectionId: section.id,
        sectionLabel: section.label,
        category: task.category || section.label,
        shiftType: section.shiftType,
      })),
    );
}

function taskRunsToday(task, date) {
  if (!task.recurring?.weekdays?.length) return true;
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return task.recurring.weekdays.includes(weekday);
}

function getCompletion(logs, date, taskId) {
  return logs.find((log) => log.date === date && log.taskId === taskId);
}

function Login({ onLogin }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    const user = staffCodes.find((staff) => staff.code.toLowerCase() === code.trim().toLowerCase());
    if (!user) {
      setError('Code not found. Try one of the demo codes in the README.');
      return;
    }
    saveStorage(SESSION_KEY, user);
    onLogin(user);
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Mesh Youngstorget</p>
        <h1>Shift checklist</h1>
        <p className="muted">Sign in with your staff code to start today&apos;s routines.</p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="staff-code">Staff code</label>
          <input
            id="staff-code"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="1001"
          />
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
      <div>
        <strong>{user.name}</strong>
        <span>{user.role}</span>
      </div>
      <div className="top-actions">
        {selectedShift && <span className="shift-pill">{shiftLabel}</span>}
        {selectedShift && <button type="button" className="ghost-button" onClick={onBack}>Change</button>}
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
  if (!task.inputType) return null;
  if (task.inputType === 'yesno') {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose yes/no</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    );
  }
  if (task.inputType === 'number') {
    return <input type="number" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter number" />;
  }
  if (task.inputType === 'text') {
    return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Add text" />;
  }
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Add comment" rows="3" />;
}

function Checklist({ user, shiftType, routines, logs, setLogs }) {
  const [drafts, setDrafts] = useState({});
  const date = todayKey();
  const tasks = useMemo(
    () => flattenTasks(routines, shiftType).filter((task) => taskRunsToday(task, date)),
    [routines, shiftType, date],
  );
  const completed = tasks.filter((task) => getCompletion(logs, date, task.id));
  const grouped = tasks.reduce((groups, task) => {
    groups[task.category] = groups[task.category] || [];
    groups[task.category].push(task);
    return groups;
  }, {});

  function toggleTask(task) {
    const existing = getCompletion(logs, date, task.id);
    if (existing) {
      const nextLogs = logs.filter((log) => !(log.date === date && log.taskId === task.id));
      setLogs(nextLogs);
      saveStorage(LOG_KEY, nextLogs);
      return;
    }

    const nextLog = {
      id: `${date}-${task.id}-${Date.now()}`,
      taskId: task.id,
      taskTitle: task.title,
      date,
      time: timeStamp(),
      completedBy: user.name,
      staffRole: user.role,
      shiftType,
      priority: task.priority,
      category: task.category,
      inputType: task.inputType || null,
      input: drafts[task.id] || '',
      comment: drafts[task.id] || '',
      completedAt: new Date().toISOString(),
    };
    const nextLogs = [...logs, nextLog];
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
          <h1>{completed.length}/{tasks.length} tasks completed</h1>
        </div>
        <div className="progress-track">
          <span style={{ width: `${tasks.length ? (completed.length / tasks.length) * 100 : 0}%` }} />
        </div>
      </section>

      {Object.entries(grouped).map(([category, categoryTasks]) => (
        <section key={category} className="task-section">
          <h2>{category}</h2>
          {categoryTasks.map((task) => {
            const completion = getCompletion(logs, date, task.id);
            const isDone = Boolean(completion);
            return (
              <article key={task.id} className={`task-card priority-${task.priority} ${isDone ? 'is-done' : ''}`}>
                <button type="button" className="task-toggle" onClick={() => toggleTask(task)} aria-pressed={isDone}>
                  <span className="checkbox">{isDone ? 'OK' : ''}</span>
                  <span>
                    <strong>{task.title}</strong>
                    {task.description && <small>{task.description}</small>}
                  </span>
                </button>
                <div className="task-meta">
                  <span>{priorityLabels[task.priority]}</span>
                  {completion && <span>Done by {completion.completedBy} at {completion.time}</span>}
                </div>
                {!isDone && (
                  <TaskInput
                    task={task}
                    value={drafts[task.id] || ''}
                    onChange={(value) => setDrafts((current) => ({ ...current, [task.id]: value }))}
                  />
                )}
                {isDone && completion.comment && <p className="completion-note">{completion.comment}</p>}
              </article>
            );
          })}
        </section>
      ))}
    </main>
  );
}

function ManagerDashboard({ routines, setRoutines, logs, setLogs }) {
  const [date, setDate] = useState(todayKey());
  const [staffFilter, setStaffFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');

  const activeShifts = shiftOptions.filter((shift) => shift.id !== 'guides');
  const filteredLogs = logs.filter((log) => {
    const dateMatch = log.date === date;
    const staffMatch = staffFilter === 'all' || log.completedBy === staffFilter;
    const shiftMatch = shiftFilter === 'all' || log.shiftType === shiftFilter;
    return dateMatch && staffMatch && shiftMatch;
  });
  const allTasks = activeShifts.flatMap((shift) => flattenTasks(routines, shift.id).filter((task) => taskRunsToday(task, date)));
  const visibleTasks = allTasks.filter((task) => shiftFilter === 'all' || task.shiftType === shiftFilter);
  const missingTasks = visibleTasks.filter((task) => !logs.some((log) => log.date === date && log.taskId === task.id));
  const criticalMissing = missingTasks.filter((task) => task.priority === 'critical');
  const staffNames = [...new Set(logs.map((log) => log.completedBy))].sort();
  const dates = [...new Set(logs.map((log) => log.date))].sort().reverse();

  function progressForShift(shiftType) {
    const shiftTasks = flattenTasks(routines, shiftType).filter((task) => taskRunsToday(task, date));
    const done = shiftTasks.filter((task) => logs.some((log) => log.date === date && log.taskId === task.id)).length;
    return { done, total: shiftTasks.length };
  }

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      logs,
      routines,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mesh-shift-log-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.logs)) {
          setLogs(data.logs);
          saveStorage(LOG_KEY, data.logs);
        }
        if (Array.isArray(data.routines)) {
          setRoutines(data.routines);
          saveStorage(ROUTINE_KEY, data.routines);
        }
      } catch {
        alert('Could not import that JSON file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  return (
    <main className="page manager-page">
      <section className="intro compact">
        <p className="eyebrow">Manager</p>
        <h1>Dashboard</h1>
      </section>

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

      <section className="summary-grid">
        {activeShifts.map((shift) => {
          const progress = progressForShift(shift.id);
          return (
            <article key={shift.id} className="summary-card">
              <span>{shift.label}</span>
              <strong>{progress.done}/{progress.total}</strong>
            </article>
          );
        })}
      </section>

      {criticalMissing.length > 0 && (
        <section className="critical-panel">
          <h2>Critical missing</h2>
          {criticalMissing.map((task) => (
            <p key={task.id}>{task.title} <span>{task.category}</span></p>
          ))}
        </section>
      )}

      <section className="manager-list">
        <h2>Completed tasks</h2>
        {filteredLogs.length === 0 && <p className="muted">No completed tasks match these filters.</p>}
        {filteredLogs.map((log) => (
          <article key={log.id} className={`log-row priority-${log.priority}`}>
            <strong>{log.taskTitle}</strong>
            <span>{log.completedBy} | {log.shiftType} | {log.time}</span>
            {log.comment && <small>{log.comment}</small>}
          </article>
        ))}
      </section>

      <section className="manager-list">
        <h2>Missing tasks</h2>
        {missingTasks.map((task) => (
          <article key={task.id} className={`log-row priority-${task.priority}`}>
            <strong>{task.title}</strong>
            <span>{task.shiftType} | {task.category}</span>
          </article>
        ))}
      </section>

      <section className="history-panel">
        <h2>History by date</h2>
        <div className="date-chips">
          {[todayKey(), ...dates.filter((entry) => entry !== todayKey())].slice(0, 12).map((entry) => (
            <button key={entry} type="button" onClick={() => setDate(entry)} className={entry === date ? 'active' : ''}>
              {entry}
            </button>
          ))}
        </div>
      </section>

      <section className="backup-panel">
        <h2>Backup</h2>
        <div className="backup-actions">
          <button type="button" className="primary-button" onClick={exportData}>Export JSON</button>
          <label className="file-button">
            Import JSON
            <input type="file" accept="application/json" onChange={importData} />
          </label>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(() => readStorage(SESSION_KEY, null));
  const [selectedShift, setSelectedShift] = useState(null);
  const [showManager, setShowManager] = useState(false);
  const [logs, setLogs] = useState(() => readStorage(LOG_KEY, []));
  const [routines, setRoutines] = useState(() => readStorage(ROUTINE_KEY, defaultRoutines));

  useEffect(() => {
    saveStorage(LOG_KEY, logs);
  }, [logs]);

  useEffect(() => {
    saveStorage(ROUTINE_KEY, routines);
  }, [routines]);

  if (!user) return <Login onLogin={setUser} />;

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
        <Checklist user={user} shiftType={selectedShift} routines={routines} logs={logs} setLogs={setLogs} />
      )}
      {showManager && user.isManager && (
        <ManagerDashboard routines={routines} setRoutines={setRoutines} logs={logs} setLogs={setLogs} />
      )}
    </>
  );
}
