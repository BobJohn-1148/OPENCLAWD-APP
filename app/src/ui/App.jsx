import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Mail,
  GraduationCap,
  Clock,
  Bot,
  ClipboardList,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const tabs = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'inbox', label: 'Inbox', icon: Mail },
  { key: 'classes', label: 'Classes', icon: BookOpen },
  { key: 'assignments', label: 'Assignments', icon: GraduationCap },
  { key: 'cron', label: 'Cron Jobs', icon: Clock },
  { key: 'assistant', label: 'Assistant', icon: Bot },
  { key: 'tasks', label: 'Task Board', icon: ClipboardList },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

function formatAbsolute(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(ts) {
  const diffMs = Date.now() - ts;
  const diffS = Math.max(0, Math.floor(diffMs / 1000));
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function shouldShowAbsolute(ts) {
  const diffMs = Date.now() - ts;
  return diffMs >= 8 * 60 * 60 * 1000;
}

function FeedItem({ item }) {
  const [open, setOpen] = useState(false);

  const showAbs = shouldShowAbsolute(item.ts);
  return (
    <div className="feedItem">
      <div className="feedRow">
        <div>
          <div className="feedTitle">{item.title}</div>
          <div className="feedMeta">
            <span className={`chip ${item.status}`}>{item.status}</span>
          </div>
        </div>
        <div className="feedWhen" title={formatAbsolute(item.ts)}>
          {formatRelative(item.ts)}{showAbs ? ` • ${formatAbsolute(item.ts)}` : ''}
        </div>
      </div>

      {item.details ? (
        <div className="feedDetails">
          {open ? (
            <>
              <div style={{ marginBottom: 6 }}>{item.details}</div>
              <button className="linkBtn" onClick={() => setOpen(false)}>
                Hide details
              </button>
            </>
          ) : (
            <button className="linkBtn" onClick={() => setOpen(true)}>
              View details
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CronJobsPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);

  async function refresh() {
    const rows = await window.bob?.outboxList?.({ limit: 50 });
    setItems(rows || []);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="dashboardLayout">
      <div className="dashboardLeft">
        <GlassCard title="Optimization Research">
          <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            Synced from the VPS outbox when VPS Sync is enabled.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <button className="btn" onClick={refresh}>Refresh</button>
            <button
              className="btn"
              onClick={async () => {
                // seed a local mock item so the UI is not empty
                const mock = {
                  id: `local_${Date.now()}`,
                  job: 'app.optimize.research',
                  title: 'Mock: Improve cron table density + empty states',
                  body_md:
                    'Suggestions:\n\n- Make the Cron Jobs table denser (smaller row height)\n- Add empty-state visuals\n- Use 2-column layout for details\n\nExample:\n\n- Before: large cards\n- After: compact list + right-side detail panel',
                  created_at: Date.now(),
                  received_at: Date.now(),
                  status: 'new',
                };
                // Insert via audit log path (quick hack): we’ll store these through SQLite later if you want.
                // For now, just show it in memory.
                setItems((x) => [mock, ...x]);
              }}
            >
              Add mock report
            </button>
          </div>
          <div className="feed">
            {items
              .filter((i) => String(i.job || '').includes('optimize') || String(i.job || '').includes('research') || true)
              .map((i) => (
                <div
                  key={i.id}
                  className="feedItem"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(i)}
                >
                  <div className="feedRow">
                    <div>
                      <div className="feedTitle">{i.title}</div>
                      <div className="feedMeta">
                        <span className="chip done">{i.job}</span>
                      </div>
                    </div>
                    <div className="feedWhen" title={formatAbsolute(i.created_at)}>
                      {formatRelative(i.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            {items.length === 0 ? (
              <div className="tiny" style={{ color: 'var(--muted)', padding: 10 }}>
                No reports yet. Enable Settings → VPS Sync, then wait for the 4-hour cron to produce reports.
              </div>
            ) : null}
          </div>
        </GlassCard>
      </div>

      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">Report details</div>
        </div>
        <div className="cardBody" style={{ whiteSpace: 'pre-wrap' }}>
          {!selected ? (
            <div className="tiny" style={{ color: 'var(--muted)' }}>Select a report to view details.</div>
          ) : (
            <>
              <div style={{ fontWeight: 650, color: 'var(--text)', marginBottom: 10 }}>{selected.title}</div>
              <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{selected.job}</div>
              <div style={{ color: 'var(--text)' }}>{selected.body_md}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskBoardPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });

  async function refresh() {
    setError('');
    try {
      const rows = await window.bob?.tasksList?.();
      setItems(rows || []);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const grouped = useMemo(() => ({
    todo: items.filter((x) => x.status === 'todo'),
    doing: items.filter((x) => x.status === 'doing'),
    done: items.filter((x) => x.status === 'done'),
  }), [items]);

  const columns = [
    { key: 'todo', label: 'To Do' },
    { key: 'doing', label: 'In Progress' },
    { key: 'done', label: 'Done' },
  ];

  async function createTask(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setError('');
    try {
      await window.bob?.tasksCreate?.({
        title: form.title,
        description: form.description,
        priority: form.priority,
        owner: 'openclawd-bot',
      });
      setForm({ title: '', description: '', priority: 'medium' });
      await refresh();
    } catch (e2) {
      setError(String(e2?.message || e2));
    }
  }

  async function moveTask(item, nextStatus) {
    if (item.status === nextStatus) return;
    await window.bob?.tasksUpdate?.({ id: item.id, status: nextStatus });
    await refresh();
  }

  return (
    <div className="tasksLayout">
      <GlassCard title="Add task for OpenClawd bot">
        <form className="taskForm" onSubmit={createTask}>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="What should OpenClawd do next?"
            className="inputLike"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Add details, acceptance criteria, or context"
            className="inputLike taskTextarea"
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="inputLike"
              style={{ maxWidth: 180 }}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button className="btn" type="submit">Create task</button>
            <button className="btn" type="button" onClick={refresh}>Refresh</button>
          </div>
          {error ? <div className="tiny" style={{ color: '#fda4af' }}>{error}</div> : null}
        </form>
      </GlassCard>

      <div className="kanban">
        {columns.map((col) => (
          <div key={col.key} className="kanbanCol glass">
            <div className="kanbanHeader">
              <div className="cardTitle">{col.label}</div>
              <div className="tiny" style={{ color: 'var(--muted)' }}>{grouped[col.key].length}</div>
            </div>
            <div className="kanbanItems">
              {grouped[col.key].map((item) => (
                <div key={item.id} className="kanbanCard">
                  <div className="feedTitle">{item.title}</div>
                  {item.description ? <div className="tiny" style={{ color: 'var(--muted)' }}>{item.description}</div> : null}
                  <div className="taskMetaRow">
                    <span className={`chip priority-${item.priority}`}>{item.priority}</span>
                    <span className="tiny" style={{ color: 'var(--muted)' }}>{formatRelative(item.updated_at)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {col.key !== 'todo' ? <button className="btn" onClick={() => moveTask(item, 'todo')}>To Do</button> : null}
                    {col.key !== 'doing' ? <button className="btn" onClick={() => moveTask(item, 'doing')}>In Progress</button> : null}
                    {col.key !== 'done' ? <button className="btn" onClick={() => moveTask(item, 'done')}>Done</button> : null}
                    <button className="btn ghost" onClick={async () => { await window.bob?.tasksDelete?.(item.id); await refresh(); }}>Delete</button>
                  </div>
                </div>
              ))}
              {!grouped[col.key].length && !loading ? (
                <div className="tiny" style={{ color: 'var(--muted)' }}>No tasks.</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GlassCard({ title, children }) {
  return (
    <div className="card glass">
      <div className="cardHeader">
        <div className="cardTitle">{title}</div>
      </div>
      <div className="cardBody">{children}</div>
    </div>
  );
}



function toInputDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CalendarPage() {
  const now = Date.now();
  const plusHour = now + 60 * 60 * 1000;
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState(toInputDateTime(plusHour));
  const [endAt, setEndAt] = useState(toInputDateTime(plusHour + 60 * 60 * 1000));
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [status, setStatus] = useState('');

  async function refreshCalendar() {
    await window.bob?.calendarSyncGoogle?.();
    const rows = await window.bob?.calendarList?.({ limit: 300 });
    const next = rows || [];
    setItems(next);
    setSelectedId((prev) => (next.some((x) => x.id === prev) ? prev : (next[0]?.id || null)));
  }

  useEffect(() => {
    refreshCalendar();
    const t = setInterval(refreshCalendar, 15000);
    return () => clearInterval(t);
  }, []);

  const selected = items.find((x) => x.id === selectedId) || null;

  return (
    <>
      <div className="dashboardLayout">
        <div className="dashboardLeft">
          <GlassCard title="Upcoming Events">
            <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
              Google Calendar workspace (local event planner for now). Reminder chips show when it is time to notify.
            </div>
            <div className="feed">
              {items.map((item) => (
                <button
                  key={item.id}
                  className={`notesListItem ${selectedId === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="feedRow">
                    <div>
                      <div className="feedTitle">{item.title}</div>
                      <div className="feedMeta">{formatAbsolute(item.start_at)}{item.end_at ? ` → ${formatAbsolute(item.end_at)}` : ''}</div>
                    </div>
                    <div>
                      {item.reminder_due ? <span className="chip error">Reminder due</span> : <span className="chip running">Reminder {item.reminder_minutes}m</span>}
                    </div>
                  </div>
                  {item.description ? <div className="tiny" style={{ color: 'var(--muted)', marginTop: 6 }}>{item.description}</div> : null}
                </button>
              ))}
              {items.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No events yet. Use “Add new event”.</div> : null}
            </div>
          </GlassCard>
        </div>

        <div className="card glass feedCard">
          <div className="cardHeader">
            <div className="cardTitle">Event Actions</div>
          </div>
          <div className="cardBody">
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setAddEventOpen(true)}>Add new event</button>
              <button className="btn" onClick={refreshCalendar}>Refresh</button>
            </div>

            {selected ? (
              <div style={{ marginTop: 14 }}>
                <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 8 }}>Selected: {selected.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
                  {formatAbsolute(selected.start_at)}{selected.end_at ? ` → ${formatAbsolute(selected.end_at)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {selected.reminder_due ? (
                    <button
                      className="btn"
                      onClick={async () => {
                        await window.bob?.calendarDismissReminder?.({ id: selected.id });
                        await refreshCalendar();
                      }}
                    >
                      Mark reminder done
                    </button>
                  ) : null}
                  <button
                    className="btn"
                    onClick={async () => {
                      await window.bob?.calendarDelete?.({ id: selected.id });
                      await refreshCalendar();
                    }}
                  >
                    Delete event
                  </button>
                </div>
              </div>
            ) : (
              <div className="tiny" style={{ color: 'var(--muted)' }}>Select an event from the left to manage reminders or delete it.</div>
            )}

            {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
          </div>
        </div>
      </div>

      {addEventOpen ? (
        <>
          <div className="drawerOverlay" onClick={() => setAddEventOpen(false)} />
          <div className="calendarModal card glass" role="dialog" aria-label="Add new event">
            <div className="cardHeader">
              <div className="cardTitle">Add New Event</div>
              <button className="btn" onClick={() => setAddEventOpen(false)}>Close</button>
            </div>
            <div className="cardBody">
              <div className="notesFormGrid">
                <label className="tiny" style={{ gridColumn: '1 / -1' }}>
                  Event title
                  <input className="notesInput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Study Session / Doctor Visit / Assignment due" />
                </label>
                <label className="tiny" style={{ gridColumn: '1 / -1' }}>
                  Description
                  <input className="notesInput" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
                </label>
                <label className="tiny">
                  Start
                  <input className="notesInput" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </label>
                <label className="tiny">
                  End
                  <input className="notesInput" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </label>
                <label className="tiny" style={{ gridColumn: '1 / -1' }}>
                  Reminder
                  <select className="notesInput" value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))}>
                    <option value={0}>At event time</option>
                    <option value={5}>5 minutes before</option>
                    <option value={10}>10 minutes before</option>
                    <option value={15}>15 minutes before</option>
                    <option value={30}>30 minutes before</option>
                    <option value={60}>1 hour before</option>
                    <option value={120}>2 hours before</option>
                    <option value={1440}>1 day before</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  onClick={async () => {
                    setStatus('Saving event…');
                    try {
                      await window.bob?.calendarCreate?.({
                        title,
                        description,
                        startAt: new Date(startAt).getTime(),
                        endAt: endAt ? new Date(endAt).getTime() : null,
                        reminderMinutes,
                      });
                      setTitle('');
                      setDescription('');
                      setStatus('Event saved.');
                      setAddEventOpen(false);
                      await refreshCalendar();
                    } catch (e) {
                      setStatus(String(e?.message || e));
                    }
                  }}
                  disabled={!title.trim() || !startAt}
                >
                  Add event
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function AssignmentsNotesPage() {
  const [classKey, setClassKey] = useState('');
  const [assignmentKey, setAssignmentKey] = useState('');
  const [title, setTitle] = useState('');
  const [contentMd, setContentMd] = useState('');
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [dashboard, setDashboard] = useState({ totalNotes: 0, classCount: 0, assignmentCount: 0, topClasses: [] });
  const [vaultPath, setVaultPath] = useState('');
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const [status, setStatus] = useState('');

  async function refreshGroups() {
    const rows = await window.bob?.notesClasses?.();
    const next = rows || [];
    setGroups(next);
    if (!classKey && next[0]?.class_key) {
      setClassKey(next[0].class_key);
      setAssignmentKey('');
    }
  }

  async function refreshDashboard() {
    const d = await window.bob?.notesDashboard?.();
    if (d) setDashboard(d);
  }

  async function refreshNotes({ nextClassKey, nextAssignmentKey } = {}) {
    const c = typeof nextClassKey === 'string' ? nextClassKey : classKey;
    const a = typeof nextAssignmentKey === 'string' ? nextAssignmentKey : assignmentKey;
    const rows = await window.bob?.notesList?.({ classKey: c, assignmentKey: a || undefined, limit: 250 });
    const next = rows || [];
    setItems(next);
    setSelectedId((prev) => (next.some((x) => x.id === prev) ? prev : (next[0]?.id || null)));
  }

  useEffect(() => {
    (async () => {
      const cfg = await window.bob?.notesObsidianGetConfig?.();
      if (cfg) {
        setVaultPath(cfg.vaultPath || '');
        setVaultEnabled(Boolean(cfg.enabled));
      }
      await refreshGroups();
      await refreshDashboard();
      await refreshNotes();
    })();
  }, []);

  useEffect(() => {
    refreshNotes();
  }, [classKey, assignmentKey]);

  const selected = items.find((x) => x.id === selectedId) || null;

  return (
    <div className="notesPageLayout">
      <div className="card glass notesNav">
        <div className="cardHeader">
          <div className="cardTitle">Classes</div>
        </div>
        <div className="cardBody notesNavBody">
          {Array.from(new Set(groups.map((g) => g.class_key))).map((klass) => (
            <div key={klass} className="notesClassBlock">
              <button
                className={`notesClassBtn ${classKey === klass && !assignmentKey ? 'active' : ''}`}
                onClick={() => {
                  setClassKey(klass);
                  setAssignmentKey('');
                }}
              >
                {klass}
              </button>
              <div className="notesClassAssignments">
                {groups
                  .filter((g) => g.class_key === klass && g.assignment_key)
                  .map((g) => (
                    <button
                      key={`${g.class_key}_${g.assignment_key}`}
                      className={`notesAssignmentBtn ${classKey === g.class_key && assignmentKey === g.assignment_key ? 'active' : ''}`}
                      onClick={() => {
                        setClassKey(g.class_key);
                        setAssignmentKey(g.assignment_key);
                      }}
                    >
                      {g.assignment_key} <span className="tiny">({g.note_count})</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {groups.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No saved classes yet.</div> : null}
        </div>
      </div>

      <div className="dashboardLeft">
        <GlassCard title="Class Dashboard">
          <div className="kv notesStatsKv">
            <div className="k">Total Notes</div><div className="v">{dashboard.totalNotes}</div>
            <div className="k">Classes</div><div className="v">{dashboard.classCount}</div>
            <div className="k">Assignments</div><div className="v">{dashboard.assignmentCount}</div>
            <div className="k">Last Update</div><div className="v">{dashboard.lastUpdated ? formatAbsolute(dashboard.lastUpdated) : '—'}</div>
          </div>
          <div className="tiny" style={{ color: 'var(--muted)', marginTop: 10, marginBottom: 6 }}>Top classes by note count</div>
          <div className="notesTopClasses">
            {(dashboard.topClasses || []).map((x) => (
              <button key={x.class_key} className="notesClassBtn" onClick={() => { setClassKey(x.class_key); setAssignmentKey(''); }}>
                {x.class_key} <span className="tiny">({x.note_count})</span>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard title="Obsidian Vault Import">
          <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            Import Markdown notes from a local Obsidian vault. First folder level becomes Class, second level can map to Assignment.
          </div>
          <label className="tiny" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input type="checkbox" checked={vaultEnabled} onChange={(e) => setVaultEnabled(e.target.checked)} /> Enable Obsidian vault sync settings
          </label>
          <input
            className="notesInput"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
            placeholder="C:\Users\You\Documents\ObsidianVault"
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={async () => {
                setStatus('Saving Obsidian config…');
                try {
                  await window.bob?.notesObsidianSetConfig?.({ vaultPath, enabled: vaultEnabled });
                  setStatus('Obsidian config saved.');
                } catch (e) {
                  setStatus(String(e?.message || e));
                }
              }}
            >
              Save config
            </button>
            <button
              className="btn"
              onClick={async () => {
                setStatus('Importing from vault…');
                try {
                  const res = await window.bob?.notesObsidianImport?.({ vaultPath });
                  setStatus(`Imported ${res?.imported || 0} notes (${res?.scanned || 0} files scanned).`);
                  await refreshGroups();
                  await refreshDashboard();
                  await refreshNotes();
                } catch (e) {
                  setStatus(String(e?.message || e));
                }
              }}
              disabled={!vaultPath.trim()}
            >
              Import now
            </button>
          </div>
        </GlassCard>

        <GlassCard title="Paste + Save Notes">
          <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            Paste notes from Obsidian (or anywhere), save locally, and open them later from class/assignment.
          </div>
          <div className="notesFormGrid">
            <label className="tiny">
              Class
              <input
                className="notesInput"
                value={classKey}
                onChange={(e) => setClassKey(e.target.value)}
                placeholder="e.g. CS-101"
              />
            </label>
            <label className="tiny">
              Assignment (optional)
              <input
                className="notesInput"
                value={assignmentKey}
                onChange={(e) => setAssignmentKey(e.target.value)}
                placeholder="e.g. Homework 4"
              />
            </label>
            <label className="tiny" style={{ gridColumn: '1 / -1' }}>
              Note title
              <input className="notesInput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapter 3 key formulas" />
            </label>
          </div>
          <textarea
            className="notesTextarea"
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            placeholder="Paste your notes here (Markdown supported)..."
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={async () => {
                setStatus('Saving…');
                try {
                  const res = await window.bob?.notesUpsert?.({
                    classKey,
                    assignmentKey,
                    title,
                    contentMd,
                    source: 'pasted',
                  });
                  setContentMd('');
                  setTitle('');
                  setStatus('Saved locally.');
                  await refreshGroups();
                  await refreshDashboard();
                  await refreshNotes({ nextClassKey: classKey, nextAssignmentKey: assignmentKey });
                  if (res?.id) setSelectedId(res.id);
                } catch (e) {
                  setStatus(String(e?.message || e));
                }
              }}
              disabled={!classKey.trim() || !contentMd.trim()}
            >
              Save note
            </button>
            <button className="btn" onClick={async () => { await refreshGroups(); await refreshDashboard(); await refreshNotes(); }}>Refresh notes</button>
          </div>
          {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
        </GlassCard>
      </div>

      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">
            {classKey ? `Notes: ${classKey}` : 'Notes'}
            {assignmentKey ? ` / ${assignmentKey}` : ''}
          </div>
        </div>
        <div className="cardBody">
          <div className="notesList">
            {items.map((item) => (
              <button key={item.id} className={`notesListItem ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
                <div style={{ fontWeight: 650 }}>{item.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{item.assignment_key || 'General class note'}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{formatAbsolute(item.updated_at)}</div>
              </button>
            ))}
            {items.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No notes for this filter yet.</div> : null}
          </div>
          <div className="notesPreview">
            {!selected ? (
              <div className="tiny" style={{ color: 'var(--muted)' }}>Select a saved note to view it.</div>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{selected.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{selected.assignment_key || 'General class note'}</div>
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{selected.content_md}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotesAssistantPage() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('');

  async function refreshNotes() {
    const rows = await window.bob?.notesList?.({ limit: 200 });
    const next = rows || [];
    setItems(next);
    if (!selectedId && next[0]) setSelectedId(next[0].id);
  }

  useEffect(() => {
    refreshNotes();
  }, []);

  const selected = items.find((x) => x.id === selectedId) || null;

  return (
    <div className="dashboardLayout">
      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">Notes AI Assistant</div>
        </div>
        <div className="cardBody">
          <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            Subagents can summarize notes, generate flashcards, and extract tasks from your class notes.
          </div>
          <div className="notesList">
            {items.map((item) => (
              <button key={item.id} className={`notesListItem ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
                <div style={{ fontWeight: 650 }}>{item.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{item.class_key}{item.assignment_key ? ` / ${item.assignment_key}` : ''}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">AI Actions</div>
        </div>
        <div className="cardBody">
          {!selected ? (
            <div className="tiny" style={{ color: 'var(--muted)' }}>Select a note first.</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{selected.title}</div>
              <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{selected.class_key}{selected.assignment_key ? ` / ${selected.assignment_key}` : ''}</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={async () => {
                  setStatus('Generating summary…');
                  const res = await window.bob?.notesAiAction?.({ action: 'summary', noteId: selected.id });
                  setResult(res?.payload?.result || 'No result.');
                  setStatus('Done.');
                }}>Summarize</button>
                <button className="btn" onClick={async () => {
                  setStatus('Generating flashcards…');
                  const res = await window.bob?.notesAiAction?.({ action: 'flashcards', noteId: selected.id });
                  setResult(res?.payload?.result || 'No result.');
                  setStatus('Done.');
                }}>Make flashcards</button>
                <button className="btn" onClick={async () => {
                  setStatus('Extracting tasks…');
                  const res = await window.bob?.notesAiAction?.({ action: 'tasks', noteId: selected.id });
                  setResult(res?.payload?.result || 'No result.');
                  setStatus('Done.');
                }}>Extract tasks</button>
              </div>
              {status ? <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{status}</div> : null}
              <div className="notesPreview" style={{ minHeight: 250 }}>
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{result || 'Run an action to see output.'}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function InboxPage() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  async function refreshInbox() {
    await window.bob?.inboxSyncGoogle?.();
    const rows = await window.bob?.inboxList?.({ limit: 200 });
    const next = (rows || []).filter((x) => showArchived || !x.archived_at);
    setItems(next);
    setSelectedId((prev) => (next.some((x) => x.id === prev) ? prev : (next[0]?.id || null)));
  }

  useEffect(() => {
    refreshInbox();
  }, [showArchived]);

  const selected = items.find((x) => x.id === selectedId) || null;

  useEffect(() => {
    setLabelInput(selected?.triage_label || '');
  }, [selectedId, selected?.triage_label]);

  return (
    <div className="dashboardLayout">
      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">Gmail Viewer + Triage</div>
        </div>
        <div className="cardBody">
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={refreshInbox}>Refresh</button>
            <button className="btn" onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>
          </div>
          <div className="notesList">
            {items.map((m) => (
              <button key={m.id} className={`notesListItem ${selectedId === m.id ? 'active' : ''}`} onClick={() => setSelectedId(m.id)}>
                <div style={{ fontWeight: 650 }}>{m.subject}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>From: {m.from_name}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{formatAbsolute(m.received_at)}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>
                  {m.is_pinned ? '📌 Pinned' : ''}{m.triage_label ? `${m.is_pinned ? ' • ' : ''}🏷 ${m.triage_label}` : ''}{m.archived_at ? `${(m.is_pinned || m.triage_label) ? ' • ' : ''}🗄 Archived` : ''}
                </div>
              </button>
            ))}
            {items.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No emails yet.</div> : null}
          </div>
        </div>
      </div>

      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">Email Summary + Draft + AI triage</div>
        </div>
        <div className="cardBody">
          {!selected ? (
            <div className="tiny" style={{ color: 'var(--muted)' }}>Select an email to generate summary/draft or triage it.</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{selected.subject}</div>
              <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>From: {selected.from_name}</div>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', marginBottom: 12 }}>{selected.body_text}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <button className="btn" onClick={async () => {
                  setStatus('Generating summary…');
                  const res = await window.bob?.inboxGenerateSummary?.({ messageId: selected.id });
                  setOutput(res?.content || 'No summary.');
                  setStatus('Summary generated.');
                }}>Generate summary</button>
                <button className="btn" onClick={async () => {
                  setStatus('Generating draft…');
                  const res = await window.bob?.inboxGenerateDraft?.({ messageId: selected.id });
                  setOutput(res?.content || 'No draft.');
                  setStatus('Draft generated.');
                }}>Generate draft</button>
                <button className="btn" onClick={async () => {
                  setStatus('Running AI categorization…');
                  const res = await window.bob?.inboxAiCategorize?.({ messageId: selected.id });
                  setOutput(res?.content || 'No triage output.');
                  setStatus('AI categorization complete.');
                  await refreshInbox();
                }}>AI categorize</button>
              </div>
              <div className="notesFormGrid" style={{ marginBottom: 10 }}>
                <button className="btn" onClick={async () => {
                  await window.bob?.inboxPin?.({ messageId: selected.id, pinned: !selected.is_pinned });
                  await refreshInbox();
                }}>{selected.is_pinned ? 'Unpin' : 'Pin'}</button>
                <label className="tiny">Label
                  <input className="notesInput" value={labelInput} onChange={(e) => setLabelInput(e.target.value)} placeholder="Class, Admin, Meeting..." />
                </label>
                <button className="btn" onClick={async () => {
                  await window.bob?.inboxLabel?.({ messageId: selected.id, label: labelInput });
                  await refreshInbox();
                }}>Apply label</button>
                <button className="btn" onClick={async () => {
                  await window.bob?.inboxArchive?.({ messageId: selected.id, archived: !selected.archived_at });
                  await refreshInbox();
                }}>{selected.archived_at ? 'Unarchive' : 'Archive'}</button>
              </div>
              {status ? <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{status}</div> : null}
              <div className="notesPreview">
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{output || 'Click Generate summary, Generate draft, or AI categorize.'}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassesPage() {
  const [semesterKey, setSemesterKey] = useState('Fall 2026');
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [classCode, setClassCode] = useState('');
  const [className, setClassName] = useState('');
  const [instructor, setInstructor] = useState('');
  const [meetingSchedule, setMeetingSchedule] = useState('');
  const [location, setLocation] = useState('');
  const [notesMd, setNotesMd] = useState('');
  const [status, setStatus] = useState('');

  async function refreshClasses() {
    const next = await window.bob?.classesList?.({ semesterKey });
    setRows(next || []);
    setSelectedId((prev) => ((next || []).some((x) => x.id === prev) ? prev : (next?.[0]?.id || null)));
  }

  useEffect(() => { refreshClasses(); }, [semesterKey]);
  useEffect(() => {
    const sel = rows.find((x) => x.id === selectedId);
    if (!sel) return;
    setClassCode(sel.class_code || '');
    setClassName(sel.class_name || '');
    setInstructor(sel.instructor || '');
    setMeetingSchedule(sel.meeting_schedule || '');
    setLocation(sel.location || '');
    setNotesMd(sel.notes_md || '');
  }, [selectedId]);

  return (
    <div className="dashboardLayout">
      <div className="card glass feedCard">
        <div className="cardHeader"><div className="cardTitle">Classes</div></div>
        <div className="cardBody">
          <label className="tiny">Semester
            <input className="notesInput" value={semesterKey} onChange={(e) => setSemesterKey(e.target.value)} placeholder="Spring 2026" />
          </label>
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={async () => {
              const res = await window.bob?.classesSeedProvided?.();
              if (res?.semesterKey) setSemesterKey(res.semesterKey);
              await refreshClasses();
              setStatus(`Imported ${res?.count || 0} provided classes.`);
            }}>
              Import provided classes
            </button>
          </div>
          <div className="notesList" style={{ marginTop: 10 }}>
            {rows.map((r) => (
              <button key={r.id} className={`notesListItem ${selectedId === r.id ? 'active' : ''}`} onClick={() => setSelectedId(r.id)}>
                <div style={{ fontWeight: 650 }}>{r.class_code} — {r.class_name}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{r.instructor || 'No instructor yet'}</div>
              </button>
            ))}
            {rows.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No classes for this semester yet.</div> : null}
          </div>
        </div>
      </div>
      <div className="card glass feedCard">
        <div className="cardHeader"><div className="cardTitle">Class Info (manual)</div></div>
        <div className="cardBody">
          <div className="notesFormGrid">
            <label className="tiny">Class code<input className="notesInput" value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="CS-101" /></label>
            <label className="tiny">Class name<input className="notesInput" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Intro to CS" /></label>
            <label className="tiny">Instructor<input className="notesInput" value={instructor} onChange={(e) => setInstructor(e.target.value)} /></label>
            <label className="tiny">Meeting schedule<input className="notesInput" value={meetingSchedule} onChange={(e) => setMeetingSchedule(e.target.value)} placeholder="Mon/Wed 9:00-10:15" /></label>
            <label className="tiny" style={{ gridColumn: '1 / -1' }}>Location<input className="notesInput" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
          </div>
          <textarea className="notesTextarea" value={notesMd} onChange={(e) => setNotesMd(e.target.value)} placeholder="Syllabus notes, grading policy, links..." />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={async () => {
              setStatus('Saving class…');
              const res = await window.bob?.classesUpsert?.({ id: selectedId, semesterKey, classCode, className, instructor, meetingSchedule, location, notesMd });
              setStatus('Saved.');
              await refreshClasses();
              if (res?.id) setSelectedId(res.id);
            }} disabled={!semesterKey.trim() || !classCode.trim() || !className.trim()}>Save class</button>
            {selectedId ? <button className="btn" onClick={async () => { await window.bob?.classesDelete?.({ id: selectedId }); setSelectedId(null); await refreshClasses(); }}>Delete class</button> : null}
          </div>
          {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
        </div>
      </div>
    </div>
  );
}

function ChatGPTAssistantPage() {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');
  return (
    <div className="card glass feedCard" style={{ width: '100%' }}>
      <div className="cardHeader"><div className="cardTitle">ChatGPT Assistant</div></div>
      <div className="cardBody">
        <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
          This app now uses ChatGPT directly. Configure API key in Settings → ChatGPT.
        </div>
        <textarea className="notesTextarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask ChatGPT anything about your emails, classes, notes, and schedule..." />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button className="btn" onClick={async () => {
            setStatus('Asking ChatGPT…');
            const res = await window.bob?.chatgptAsk?.({ prompt });
            setAnswer(res?.content || 'No response.');
            setStatus('Done.');
          }} disabled={!prompt.trim()}>Ask ChatGPT</button>
        </div>
        {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
        <div className="notesPreview" style={{ marginTop: 10 }}><div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{answer || 'Response will appear here.'}</div></div>
      </div>
    </div>
  );
}

function GoogleSettings() {
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [connected, setConnected] = useState(false);

  async function refreshStatus() {
    const cfg = await window.bob?.googleGetConfig?.();
    const st = await window.bob?.googleStatus?.();
    setClientId(cfg?.clientId || '');
    setConnected(Boolean(st?.connected));
  }

  useEffect(() => { refreshStatus(); }, []);

  return (
    <div>
      <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
        Connect your real Google account once, then Inbox/Calendar will fetch live data.
      </div>
      <label className="tiny" style={{ display: 'block', marginBottom: 10 }}>
        Google OAuth Client ID (Desktop app)
        <input className="notesInput" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="123...apps.googleusercontent.com" />
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={async () => {
          setStatus('Saving client ID…');
          await window.bob?.googleSetConfig?.({ clientId });
          setStatus('Saved.');
          await refreshStatus();
        }} disabled={!clientId.trim()}>
          Save Client ID
        </button>
        <button className="btn" onClick={async () => {
          setStatus('Opening Google consent…');
          try {
            await window.bob?.googleConnect?.();
            setStatus('Connected to Google.');
            await refreshStatus();
          } catch (e) {
            setStatus(String(e?.message || e));
          }
        }} disabled={!clientId.trim()}>
          Connect Gmail + Calendar
        </button>
        <button className="btn" onClick={async () => {
          await window.bob?.googleDisconnect?.();
          setStatus('Disconnected.');
          await refreshStatus();
        }}>
          Disconnect
        </button>
      </div>
      <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>
        Status: {connected ? 'Connected' : 'Not connected'}
      </div>
      {status ? <div className="tiny" style={{ marginTop: 6, color: 'var(--muted)' }}>{status}</div> : null}
    </div>
  );
}

function ChatGPTSettings() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const cfg = await window.bob?.chatgptGetConfig?.();
      if (cfg) {
        setApiKey(cfg.apiKey || '');
        setModel(cfg.model || 'gpt-4o-mini');
        setSystemPrompt(cfg.systemPrompt || '');
      }
    })();
  }, []);

  return (
    <div>
      <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
        Configure ChatGPT as the core assistant for this app.
      </div>
      <div className="notesFormGrid">
        <label className="tiny" style={{ gridColumn: '1 / -1' }}>API Key
          <input className="notesInput" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </label>
        <label className="tiny">Model
          <input className="notesInput" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
        </label>
        <label className="tiny" style={{ gridColumn: '1 / -1' }}>System prompt
          <textarea className="notesTextarea" style={{ minHeight: 120 }} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
        </label>
      </div>
      <button className="btn" onClick={async () => {
        setStatus('Saving…');
        await window.bob?.chatgptSetConfig?.({ apiKey, model, systemPrompt });
        setStatus('Saved.');
      }}>Save ChatGPT config</button>
      {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
    </div>
  );
}



function toInputDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CalendarPage() {
  const now = Date.now();
  const plusHour = now + 60 * 60 * 1000;
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState(toInputDateTime(plusHour));
  const [endAt, setEndAt] = useState(toInputDateTime(plusHour + 60 * 60 * 1000));
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [status, setStatus] = useState('');

  async function refreshCalendar() {
    await window.bob?.calendarSyncGoogle?.();
    const rows = await window.bob?.calendarList?.({ limit: 300 });
    const next = rows || [];
    setItems(next);
    setSelectedId((prev) => (next.some((x) => x.id === prev) ? prev : (next[0]?.id || null)));
  }

  useEffect(() => {
    refreshCalendar();
    const t = setInterval(refreshCalendar, 15000);
    return () => clearInterval(t);
  }, []);

  const selected = items.find((x) => x.id === selectedId) || null;

  return (
    <>
      <div className="dashboardLayout">
        <div className="dashboardLeft">
          <GlassCard title="Upcoming Events">
            <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
              Google Calendar workspace (local event planner for now). Reminder chips show when it is time to notify.
            </div>
            <div className="feed">
              {items.map((item) => (
                <button
                  key={item.id}
                  className={`notesListItem ${selectedId === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="feedRow">
                    <div>
                      <div className="feedTitle">{item.title}</div>
                      <div className="feedMeta">{formatAbsolute(item.start_at)}{item.end_at ? ` → ${formatAbsolute(item.end_at)}` : ''}</div>
                    </div>
                    <div>
                      {item.reminder_due ? <span className="chip error">Reminder due</span> : <span className="chip running">Reminder {item.reminder_minutes}m</span>}
                    </div>
                  </div>
                  {item.description ? <div className="tiny" style={{ color: 'var(--muted)', marginTop: 6 }}>{item.description}</div> : null}
                </button>
              ))}
              {items.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No events yet. Use “Add new event”.</div> : null}
            </div>
          </GlassCard>
        </div>

        <div className="card glass feedCard">
          <div className="cardHeader">
            <div className="cardTitle">Event Actions</div>
          </div>
          <div className="cardBody">
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setAddEventOpen(true)}>Add new event</button>
              <button className="btn" onClick={refreshCalendar}>Refresh</button>
            </div>

            {selected ? (
              <div style={{ marginTop: 14 }}>
                <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 8 }}>Selected: {selected.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
                  {formatAbsolute(selected.start_at)}{selected.end_at ? ` → ${formatAbsolute(selected.end_at)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {selected.reminder_due ? (
                    <button
                      className="btn"
                      onClick={async () => {
                        await window.bob?.calendarDismissReminder?.({ id: selected.id });
                        await refreshCalendar();
                      }}
                    >
                      Mark reminder done
                    </button>
                  ) : null}
                  <button
                    className="btn"
                    onClick={async () => {
                      await window.bob?.calendarDelete?.({ id: selected.id });
                      await refreshCalendar();
                    }}
                  >
                    Delete event
                  </button>
                </div>
              </div>
            ) : (
              <div className="tiny" style={{ color: 'var(--muted)' }}>Select an event from the left to manage reminders or delete it.</div>
            )}

            {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
          </div>
        </div>
      </div>

      {addEventOpen ? (
        <>
          <div className="drawerOverlay" onClick={() => setAddEventOpen(false)} />
          <div className="calendarModal card glass" role="dialog" aria-label="Add new event">
            <div className="cardHeader">
              <div className="cardTitle">Add New Event</div>
              <button className="btn" onClick={() => setAddEventOpen(false)}>Close</button>
            </div>
            <div className="cardBody">
              <div className="notesFormGrid">
                <label className="tiny" style={{ gridColumn: '1 / -1' }}>
                  Event title
                  <input className="notesInput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Study Session / Doctor Visit / Assignment due" />
                </label>
                <label className="tiny" style={{ gridColumn: '1 / -1' }}>
                  Description
                  <input className="notesInput" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
                </label>
                <label className="tiny">
                  Start
                  <input className="notesInput" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </label>
                <label className="tiny">
                  End
                  <input className="notesInput" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </label>
                <label className="tiny" style={{ gridColumn: '1 / -1' }}>
                  Reminder
                  <select className="notesInput" value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))}>
                    <option value={0}>At event time</option>
                    <option value={5}>5 minutes before</option>
                    <option value={10}>10 minutes before</option>
                    <option value={15}>15 minutes before</option>
                    <option value={30}>30 minutes before</option>
                    <option value={60}>1 hour before</option>
                    <option value={120}>2 hours before</option>
                    <option value={1440}>1 day before</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  onClick={async () => {
                    setStatus('Saving event…');
                    try {
                      await window.bob?.calendarCreate?.({
                        title,
                        description,
                        startAt: new Date(startAt).getTime(),
                        endAt: endAt ? new Date(endAt).getTime() : null,
                        reminderMinutes,
                      });
                      setTitle('');
                      setDescription('');
                      setStatus('Event saved.');
                      setAddEventOpen(false);
                      await refreshCalendar();
                    } catch (e) {
                      setStatus(String(e?.message || e));
                    }
                  }}
                  disabled={!title.trim() || !startAt}
                >
                  Add event
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function AssignmentsNotesPage() {
  const [classKey, setClassKey] = useState('');
  const [assignmentKey, setAssignmentKey] = useState('');
  const [title, setTitle] = useState('');
  const [contentMd, setContentMd] = useState('');
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [dashboard, setDashboard] = useState({ totalNotes: 0, classCount: 0, assignmentCount: 0, topClasses: [] });
  const [vaultPath, setVaultPath] = useState('');
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const [status, setStatus] = useState('');

  async function refreshGroups() {
    const rows = await window.bob?.notesClasses?.();
    const next = rows || [];
    setGroups(next);
    if (!classKey && next[0]?.class_key) {
      setClassKey(next[0].class_key);
      setAssignmentKey('');
    }
  }

  async function refreshDashboard() {
    const d = await window.bob?.notesDashboard?.();
    if (d) setDashboard(d);
  }

  async function refreshNotes({ nextClassKey, nextAssignmentKey } = {}) {
    const c = typeof nextClassKey === 'string' ? nextClassKey : classKey;
    const a = typeof nextAssignmentKey === 'string' ? nextAssignmentKey : assignmentKey;
    const rows = await window.bob?.notesList?.({ classKey: c, assignmentKey: a || undefined, limit: 250 });
    const next = rows || [];
    setItems(next);
    setSelectedId((prev) => (next.some((x) => x.id === prev) ? prev : (next[0]?.id || null)));
  }

  useEffect(() => {
    (async () => {
      const cfg = await window.bob?.notesObsidianGetConfig?.();
      if (cfg) {
        setVaultPath(cfg.vaultPath || '');
        setVaultEnabled(Boolean(cfg.enabled));
      }
      await refreshGroups();
      await refreshDashboard();
      await refreshNotes();
    })();
  }, []);

  useEffect(() => {
    refreshNotes();
  }, [classKey, assignmentKey]);

  const selected = items.find((x) => x.id === selectedId) || null;

  return (
    <div className="notesPageLayout">
      <div className="card glass notesNav">
        <div className="cardHeader">
          <div className="cardTitle">Classes</div>
        </div>
        <div className="cardBody notesNavBody">
          {Array.from(new Set(groups.map((g) => g.class_key))).map((klass) => (
            <div key={klass} className="notesClassBlock">
              <button
                className={`notesClassBtn ${classKey === klass && !assignmentKey ? 'active' : ''}`}
                onClick={() => {
                  setClassKey(klass);
                  setAssignmentKey('');
                }}
              >
                {klass}
              </button>
              <div className="notesClassAssignments">
                {groups
                  .filter((g) => g.class_key === klass && g.assignment_key)
                  .map((g) => (
                    <button
                      key={`${g.class_key}_${g.assignment_key}`}
                      className={`notesAssignmentBtn ${classKey === g.class_key && assignmentKey === g.assignment_key ? 'active' : ''}`}
                      onClick={() => {
                        setClassKey(g.class_key);
                        setAssignmentKey(g.assignment_key);
                      }}
                    >
                      {g.assignment_key} <span className="tiny">({g.note_count})</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {groups.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No saved classes yet.</div> : null}
        </div>
      </div>

      <div className="dashboardLeft">
        <GlassCard title="Class Dashboard">
          <div className="kv notesStatsKv">
            <div className="k">Total Notes</div><div className="v">{dashboard.totalNotes}</div>
            <div className="k">Classes</div><div className="v">{dashboard.classCount}</div>
            <div className="k">Assignments</div><div className="v">{dashboard.assignmentCount}</div>
            <div className="k">Last Update</div><div className="v">{dashboard.lastUpdated ? formatAbsolute(dashboard.lastUpdated) : '—'}</div>
          </div>
          <div className="tiny" style={{ color: 'var(--muted)', marginTop: 10, marginBottom: 6 }}>Top classes by note count</div>
          <div className="notesTopClasses">
            {(dashboard.topClasses || []).map((x) => (
              <button key={x.class_key} className="notesClassBtn" onClick={() => { setClassKey(x.class_key); setAssignmentKey(''); }}>
                {x.class_key} <span className="tiny">({x.note_count})</span>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard title="Obsidian Vault Import">
          <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            Import Markdown notes from a local Obsidian vault. First folder level becomes Class, second level can map to Assignment.
          </div>
          <label className="tiny" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input type="checkbox" checked={vaultEnabled} onChange={(e) => setVaultEnabled(e.target.checked)} /> Enable Obsidian vault sync settings
          </label>
          <input
            className="notesInput"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
            placeholder="C:\Users\You\Documents\ObsidianVault"
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={async () => {
                setStatus('Saving Obsidian config…');
                try {
                  await window.bob?.notesObsidianSetConfig?.({ vaultPath, enabled: vaultEnabled });
                  setStatus('Obsidian config saved.');
                } catch (e) {
                  setStatus(String(e?.message || e));
                }
              }}
            >
              Save config
            </button>
            <button
              className="btn"
              onClick={async () => {
                setStatus('Importing from vault…');
                try {
                  const res = await window.bob?.notesObsidianImport?.({ vaultPath });
                  setStatus(`Imported ${res?.imported || 0} notes (${res?.scanned || 0} files scanned).`);
                  await refreshGroups();
                  await refreshDashboard();
                  await refreshNotes();
                } catch (e) {
                  setStatus(String(e?.message || e));
                }
              }}
              disabled={!vaultPath.trim()}
            >
              Import now
            </button>
          </div>
        </GlassCard>

        <GlassCard title="Paste + Save Notes">
          <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            Paste notes from Obsidian (or anywhere), save locally, and open them later from class/assignment.
          </div>
          <div className="notesFormGrid">
            <label className="tiny">
              Class
              <input
                className="notesInput"
                value={classKey}
                onChange={(e) => setClassKey(e.target.value)}
                placeholder="e.g. CS-101"
              />
            </label>
            <label className="tiny">
              Assignment (optional)
              <input
                className="notesInput"
                value={assignmentKey}
                onChange={(e) => setAssignmentKey(e.target.value)}
                placeholder="e.g. Homework 4"
              />
            </label>
            <label className="tiny" style={{ gridColumn: '1 / -1' }}>
              Note title
              <input className="notesInput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapter 3 key formulas" />
            </label>
          </div>
          <textarea
            className="notesTextarea"
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            placeholder="Paste your notes here (Markdown supported)..."
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={async () => {
                setStatus('Saving…');
                try {
                  const res = await window.bob?.notesUpsert?.({
                    classKey,
                    assignmentKey,
                    title,
                    contentMd,
                    source: 'pasted',
                  });
                  setContentMd('');
                  setTitle('');
                  setStatus('Saved locally.');
                  await refreshGroups();
                  await refreshDashboard();
                  await refreshNotes({ nextClassKey: classKey, nextAssignmentKey: assignmentKey });
                  if (res?.id) setSelectedId(res.id);
                } catch (e) {
                  setStatus(String(e?.message || e));
                }
              }}
              disabled={!classKey.trim() || !contentMd.trim()}
            >
              Save note
            </button>
            <button className="btn" onClick={async () => { await refreshGroups(); await refreshDashboard(); await refreshNotes(); }}>Refresh notes</button>
          </div>
          {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
        </GlassCard>
      </div>

      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">
            {classKey ? `Notes: ${classKey}` : 'Notes'}
            {assignmentKey ? ` / ${assignmentKey}` : ''}
          </div>
        </div>
        <div className="cardBody">
          <div className="notesList">
            {items.map((item) => (
              <button key={item.id} className={`notesListItem ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
                <div style={{ fontWeight: 650 }}>{item.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{item.assignment_key || 'General class note'}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{formatAbsolute(item.updated_at)}</div>
              </button>
            ))}
            {items.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No notes for this filter yet.</div> : null}
          </div>
          <div className="notesPreview">
            {!selected ? (
              <div className="tiny" style={{ color: 'var(--muted)' }}>Select a saved note to view it.</div>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{selected.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{selected.assignment_key || 'General class note'}</div>
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{selected.content_md}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotesAssistantPage() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('');

  async function refreshNotes() {
    const rows = await window.bob?.notesList?.({ limit: 200 });
    const next = rows || [];
    setItems(next);
    if (!selectedId && next[0]) setSelectedId(next[0].id);
  }

  useEffect(() => {
    refreshNotes();
  }, []);

  const selected = items.find((x) => x.id === selectedId) || null;

  return (
    <div className="dashboardLayout">
      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">Notes AI Assistant</div>
        </div>
        <div className="cardBody">
          <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            Subagents can summarize notes, generate flashcards, and extract tasks from your class notes.
          </div>
          <div className="notesList">
            {items.map((item) => (
              <button key={item.id} className={`notesListItem ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
                <div style={{ fontWeight: 650 }}>{item.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{item.class_key}{item.assignment_key ? ` / ${item.assignment_key}` : ''}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">AI Actions</div>
        </div>
        <div className="cardBody">
          {!selected ? (
            <div className="tiny" style={{ color: 'var(--muted)' }}>Select a note first.</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{selected.title}</div>
              <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{selected.class_key}{selected.assignment_key ? ` / ${selected.assignment_key}` : ''}</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={async () => {
                  setStatus('Generating summary…');
                  const res = await window.bob?.notesAiAction?.({ action: 'summary', noteId: selected.id });
                  setResult(res?.payload?.result || 'No result.');
                  setStatus('Done.');
                }}>Summarize</button>
                <button className="btn" onClick={async () => {
                  setStatus('Generating flashcards…');
                  const res = await window.bob?.notesAiAction?.({ action: 'flashcards', noteId: selected.id });
                  setResult(res?.payload?.result || 'No result.');
                  setStatus('Done.');
                }}>Make flashcards</button>
                <button className="btn" onClick={async () => {
                  setStatus('Extracting tasks…');
                  const res = await window.bob?.notesAiAction?.({ action: 'tasks', noteId: selected.id });
                  setResult(res?.payload?.result || 'No result.');
                  setStatus('Done.');
                }}>Extract tasks</button>
              </div>
              {status ? <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{status}</div> : null}
              <div className="notesPreview" style={{ minHeight: 250 }}>
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{result || 'Run an action to see output.'}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function InboxPage() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  async function refreshInbox() {
    await window.bob?.inboxSyncGoogle?.();
    const rows = await window.bob?.inboxList?.({ limit: 200 });
    const next = (rows || []).filter((x) => showArchived || !x.archived_at);
    setItems(next);
    setSelectedId((prev) => (next.some((x) => x.id === prev) ? prev : (next[0]?.id || null)));
  }

  useEffect(() => {
    refreshInbox();
  }, [showArchived]);

  const selected = items.find((x) => x.id === selectedId) || null;

  useEffect(() => {
    setLabelInput(selected?.triage_label || '');
  }, [selectedId, selected?.triage_label]);

  return (
    <div className="dashboardLayout">
      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">Gmail Viewer + Triage</div>
        </div>
        <div className="cardBody">
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={refreshInbox}>Refresh</button>
            <button className="btn" onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>
          </div>
          <div className="notesList">
            {items.map((m) => (
              <button key={m.id} className={`notesListItem ${selectedId === m.id ? 'active' : ''}`} onClick={() => setSelectedId(m.id)}>
                <div style={{ fontWeight: 650 }}>{m.subject}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>From: {m.from_name}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{formatAbsolute(m.received_at)}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>
                  {m.is_pinned ? '📌 Pinned' : ''}{m.triage_label ? `${m.is_pinned ? ' • ' : ''}🏷 ${m.triage_label}` : ''}{m.archived_at ? `${(m.is_pinned || m.triage_label) ? ' • ' : ''}🗄 Archived` : ''}
                </div>
              </button>
            ))}
            {items.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No emails yet.</div> : null}
          </div>
        </div>
      </div>

      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">Email Summary + Draft + AI triage</div>
        </div>
        <div className="cardBody">
          {!selected ? (
            <div className="tiny" style={{ color: 'var(--muted)' }}>Select an email to generate summary/draft or triage it.</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{selected.subject}</div>
              <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>From: {selected.from_name}</div>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', marginBottom: 12 }}>{selected.body_text}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <button className="btn" onClick={async () => {
                  setStatus('Generating summary…');
                  const res = await window.bob?.inboxGenerateSummary?.({ messageId: selected.id });
                  setOutput(res?.content || 'No summary.');
                  setStatus('Summary generated.');
                }}>Generate summary</button>
                <button className="btn" onClick={async () => {
                  setStatus('Generating draft…');
                  const res = await window.bob?.inboxGenerateDraft?.({ messageId: selected.id });
                  setOutput(res?.content || 'No draft.');
                  setStatus('Draft generated.');
                }}>Generate draft</button>
                <button className="btn" onClick={async () => {
                  setStatus('Running AI categorization…');
                  const res = await window.bob?.inboxAiCategorize?.({ messageId: selected.id });
                  setOutput(res?.content || 'No triage output.');
                  setStatus('AI categorization complete.');
                  await refreshInbox();
                }}>AI categorize</button>
              </div>
              <div className="notesFormGrid" style={{ marginBottom: 10 }}>
                <button className="btn" onClick={async () => {
                  await window.bob?.inboxPin?.({ messageId: selected.id, pinned: !selected.is_pinned });
                  await refreshInbox();
                }}>{selected.is_pinned ? 'Unpin' : 'Pin'}</button>
                <label className="tiny">Label
                  <input className="notesInput" value={labelInput} onChange={(e) => setLabelInput(e.target.value)} placeholder="Class, Admin, Meeting..." />
                </label>
                <button className="btn" onClick={async () => {
                  await window.bob?.inboxLabel?.({ messageId: selected.id, label: labelInput });
                  await refreshInbox();
                }}>Apply label</button>
                <button className="btn" onClick={async () => {
                  await window.bob?.inboxArchive?.({ messageId: selected.id, archived: !selected.archived_at });
                  await refreshInbox();
                }}>{selected.archived_at ? 'Unarchive' : 'Archive'}</button>
              </div>
              {status ? <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{status}</div> : null}
              <div className="notesPreview">
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{output || 'Click Generate summary, Generate draft, or AI categorize.'}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassesPage() {
  const [semesterKey, setSemesterKey] = useState('Fall 2026');
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [classCode, setClassCode] = useState('');
  const [className, setClassName] = useState('');
  const [instructor, setInstructor] = useState('');
  const [meetingSchedule, setMeetingSchedule] = useState('');
  const [location, setLocation] = useState('');
  const [notesMd, setNotesMd] = useState('');
  const [status, setStatus] = useState('');

  async function refreshClasses() {
    const next = await window.bob?.classesList?.({ semesterKey });
    setRows(next || []);
    setSelectedId((prev) => ((next || []).some((x) => x.id === prev) ? prev : (next?.[0]?.id || null)));
  }

  useEffect(() => { refreshClasses(); }, [semesterKey]);
  useEffect(() => {
    const sel = rows.find((x) => x.id === selectedId);
    if (!sel) return;
    setClassCode(sel.class_code || '');
    setClassName(sel.class_name || '');
    setInstructor(sel.instructor || '');
    setMeetingSchedule(sel.meeting_schedule || '');
    setLocation(sel.location || '');
    setNotesMd(sel.notes_md || '');
  }, [selectedId]);

  return (
    <div className="dashboardLayout">
      <div className="card glass feedCard">
        <div className="cardHeader"><div className="cardTitle">Classes</div></div>
        <div className="cardBody">
          <label className="tiny">Semester
            <input className="notesInput" value={semesterKey} onChange={(e) => setSemesterKey(e.target.value)} placeholder="Spring 2026" />
          </label>
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={async () => {
              const res = await window.bob?.classesSeedProvided?.();
              if (res?.semesterKey) setSemesterKey(res.semesterKey);
              await refreshClasses();
              setStatus(`Imported ${res?.count || 0} provided classes.`);
            }}>
              Import provided classes
            </button>
          </div>
          <div className="notesList" style={{ marginTop: 10 }}>
            {rows.map((r) => (
              <button key={r.id} className={`notesListItem ${selectedId === r.id ? 'active' : ''}`} onClick={() => setSelectedId(r.id)}>
                <div style={{ fontWeight: 650 }}>{r.class_code} — {r.class_name}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{r.instructor || 'No instructor yet'}</div>
              </button>
            ))}
            {rows.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No classes for this semester yet.</div> : null}
          </div>
        </div>
      </div>
      <div className="card glass feedCard">
        <div className="cardHeader"><div className="cardTitle">Class Info (manual)</div></div>
        <div className="cardBody">
          <div className="notesFormGrid">
            <label className="tiny">Class code<input className="notesInput" value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="CS-101" /></label>
            <label className="tiny">Class name<input className="notesInput" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Intro to CS" /></label>
            <label className="tiny">Instructor<input className="notesInput" value={instructor} onChange={(e) => setInstructor(e.target.value)} /></label>
            <label className="tiny">Meeting schedule<input className="notesInput" value={meetingSchedule} onChange={(e) => setMeetingSchedule(e.target.value)} placeholder="Mon/Wed 9:00-10:15" /></label>
            <label className="tiny" style={{ gridColumn: '1 / -1' }}>Location<input className="notesInput" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
          </div>
          <textarea className="notesTextarea" value={notesMd} onChange={(e) => setNotesMd(e.target.value)} placeholder="Syllabus notes, grading policy, links..." />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={async () => {
              setStatus('Saving class…');
              const res = await window.bob?.classesUpsert?.({ id: selectedId, semesterKey, classCode, className, instructor, meetingSchedule, location, notesMd });
              setStatus('Saved.');
              await refreshClasses();
              if (res?.id) setSelectedId(res.id);
            }} disabled={!semesterKey.trim() || !classCode.trim() || !className.trim()}>Save class</button>
            {selectedId ? <button className="btn" onClick={async () => { await window.bob?.classesDelete?.({ id: selectedId }); setSelectedId(null); await refreshClasses(); }}>Delete class</button> : null}
          </div>
          {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
        </div>
      </div>
    </div>
  );
}

function ChatGPTAssistantPage() {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');
  return (
    <div className="card glass feedCard" style={{ width: '100%' }}>
      <div className="cardHeader"><div className="cardTitle">ChatGPT Assistant</div></div>
      <div className="cardBody">
        <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
          This app now uses ChatGPT directly. Configure API key in Settings → ChatGPT.
        </div>
        <textarea className="notesTextarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask ChatGPT anything about your emails, classes, notes, and schedule..." />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button className="btn" onClick={async () => {
            setStatus('Asking ChatGPT…');
            const res = await window.bob?.chatgptAsk?.({ prompt });
            setAnswer(res?.content || 'No response.');
            setStatus('Done.');
          }} disabled={!prompt.trim()}>Ask ChatGPT</button>
        </div>
        {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
        <div className="notesPreview" style={{ marginTop: 10 }}><div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{answer || 'Response will appear here.'}</div></div>
      </div>
    </div>
  );
}

function GoogleSettings() {
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [connected, setConnected] = useState(false);

  async function refreshStatus() {
    const cfg = await window.bob?.googleGetConfig?.();
    const st = await window.bob?.googleStatus?.();
    setClientId(cfg?.clientId || '');
    setConnected(Boolean(st?.connected));
  }

  useEffect(() => { refreshStatus(); }, []);

  return (
    <div>
      <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
        Connect your real Google account once, then Inbox/Calendar will fetch live data.
      </div>
      <label className="tiny" style={{ display: 'block', marginBottom: 10 }}>
        Google OAuth Client ID (Desktop app)
        <input className="notesInput" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="123...apps.googleusercontent.com" />
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={async () => {
          setStatus('Saving client ID…');
          await window.bob?.googleSetConfig?.({ clientId });
          setStatus('Saved.');
          await refreshStatus();
        }} disabled={!clientId.trim()}>
          Save Client ID
        </button>
        <button className="btn" onClick={async () => {
          setStatus('Opening Google consent…');
          try {
            await window.bob?.googleConnect?.();
            setStatus('Connected to Google.');
            await refreshStatus();
          } catch (e) {
            setStatus(String(e?.message || e));
          }
        }} disabled={!clientId.trim()}>
          Connect Gmail + Calendar
        </button>
        <button className="btn" onClick={async () => {
          await window.bob?.googleDisconnect?.();
          setStatus('Disconnected.');
          await refreshStatus();
        }}>
          Disconnect
        </button>
      </div>
      <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>
        Status: {connected ? 'Connected' : 'Not connected'}
      </div>
      {status ? <div className="tiny" style={{ marginTop: 6, color: 'var(--muted)' }}>{status}</div> : null}
    </div>
  );
}

function ChatGPTSettings() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const cfg = await window.bob?.chatgptGetConfig?.();
      if (cfg) {
        setApiKey(cfg.apiKey || '');
        setModel(cfg.model || 'gpt-4o-mini');
        setSystemPrompt(cfg.systemPrompt || '');
      }
    })();
  }, []);

  return (
    <div>
      <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
        Configure ChatGPT as the core assistant for this app.
      </div>
      <div className="notesFormGrid">
        <label className="tiny" style={{ gridColumn: '1 / -1' }}>API Key
          <input className="notesInput" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </label>
        <label className="tiny">Model
          <input className="notesInput" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
        </label>
        <label className="tiny" style={{ gridColumn: '1 / -1' }}>System prompt
          <textarea className="notesTextarea" style={{ minHeight: 120 }} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
        </label>
      </div>
      <button className="btn" onClick={async () => {
        setStatus('Saving…');
        await window.bob?.chatgptSetConfig?.({ apiKey, model, systemPrompt });
        setStatus('Saved.');
      }}>Save ChatGPT config</button>
      {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
    </div>
  );
}


function AssignmentsNotesPage() {
  const [classKey, setClassKey] = useState('');
  const [assignmentKey, setAssignmentKey] = useState('');
  const [title, setTitle] = useState('');
  const [contentMd, setContentMd] = useState('');
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [status, setStatus] = useState('');

  async function refreshGroups() {
    const rows = await window.bob?.notesClasses?.();
    const next = rows || [];
    setGroups(next);
    if (!classKey && next[0]?.class_key) {
      setClassKey(next[0].class_key);
      setAssignmentKey('');
    }
  }

  async function refreshNotes({ nextClassKey, nextAssignmentKey } = {}) {
    const c = typeof nextClassKey === 'string' ? nextClassKey : classKey;
    const a = typeof nextAssignmentKey === 'string' ? nextAssignmentKey : assignmentKey;
    const rows = await window.bob?.notesList?.({ classKey: c, assignmentKey: a || undefined, limit: 250 });
    const next = rows || [];
    setItems(next);
    setSelectedId((prev) => (next.some((x) => x.id === prev) ? prev : (next[0]?.id || null)));
  }

  useEffect(() => {
    (async () => {
      await refreshGroups();
      await refreshNotes();
    })();
  }, []);

  useEffect(() => {
    refreshNotes();
  }, [classKey, assignmentKey]);

  const selected = items.find((x) => x.id === selectedId) || null;

  return (
    <div className="notesPageLayout">
      <div className="card glass notesNav">
        <div className="cardHeader">
          <div className="cardTitle">Classes</div>
        </div>
        <div className="cardBody notesNavBody">
          {Array.from(new Set(groups.map((g) => g.class_key))).map((klass) => (
            <div key={klass} className="notesClassBlock">
              <button
                className={`notesClassBtn ${classKey === klass && !assignmentKey ? 'active' : ''}`}
                onClick={() => {
                  setClassKey(klass);
                  setAssignmentKey('');
                }}
              >
                {klass}
              </button>
              <div className="notesClassAssignments">
                {groups
                  .filter((g) => g.class_key === klass && g.assignment_key)
                  .map((g) => (
                    <button
                      key={`${g.class_key}_${g.assignment_key}`}
                      className={`notesAssignmentBtn ${classKey === g.class_key && assignmentKey === g.assignment_key ? 'active' : ''}`}
                      onClick={() => {
                        setClassKey(g.class_key);
                        setAssignmentKey(g.assignment_key);
                      }}
                    >
                      {g.assignment_key} <span className="tiny">({g.note_count})</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {groups.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No saved classes yet.</div> : null}
        </div>
      </div>

      <div className="dashboardLeft">
        <GlassCard title="Paste + Save Notes">
          <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            Paste notes from Obsidian (or anywhere), save locally, and open them later from class/assignment.
          </div>
          <div className="notesFormGrid">
            <label className="tiny">
              Class
              <input
                className="notesInput"
                value={classKey}
                onChange={(e) => setClassKey(e.target.value)}
                placeholder="e.g. CS-101"
              />
            </label>
            <label className="tiny">
              Assignment (optional)
              <input
                className="notesInput"
                value={assignmentKey}
                onChange={(e) => setAssignmentKey(e.target.value)}
                placeholder="e.g. Homework 4"
              />
            </label>
            <label className="tiny" style={{ gridColumn: '1 / -1' }}>
              Note title
              <input className="notesInput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapter 3 key formulas" />
            </label>
          </div>
          <textarea
            className="notesTextarea"
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            placeholder="Paste your notes here (Markdown supported)..."
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={async () => {
                setStatus('Saving…');
                try {
                  const res = await window.bob?.notesUpsert?.({
                    classKey,
                    assignmentKey,
                    title,
                    contentMd,
                    source: 'pasted',
                  });
                  setContentMd('');
                  setTitle('');
                  setStatus('Saved locally.');
                  await refreshGroups();
                  await refreshNotes({ nextClassKey: classKey, nextAssignmentKey: assignmentKey });
                  if (res?.id) setSelectedId(res.id);
                } catch (e) {
                  setStatus(String(e?.message || e));
                }
              }}
              disabled={!classKey.trim() || !contentMd.trim()}
            >
              Save note
            </button>
            <button className="btn" onClick={async () => { await refreshGroups(); await refreshNotes(); }}>Refresh notes</button>
          </div>
          {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
        </GlassCard>
      </div>

      <div className="card glass feedCard">
        <div className="cardHeader">
          <div className="cardTitle">
            {classKey ? `Notes: ${classKey}` : 'Notes'}
            {assignmentKey ? ` / ${assignmentKey}` : ''}
          </div>
        </div>
        <div className="cardBody">
          <div className="notesList">
            {items.map((item) => (
              <button key={item.id} className={`notesListItem ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
                <div style={{ fontWeight: 650 }}>{item.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{item.assignment_key || 'General class note'}</div>
                <div className="tiny" style={{ color: 'var(--muted)' }}>{formatAbsolute(item.updated_at)}</div>
              </button>
            ))}
            {items.length === 0 ? <div className="tiny" style={{ color: 'var(--muted)' }}>No notes for this filter yet.</div> : null}
          </div>
          <div className="notesPreview">
            {!selected ? (
              <div className="tiny" style={{ color: 'var(--muted)' }}>Select a saved note to view it.</div>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{selected.title}</div>
                <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>{selected.assignment_key || 'General class note'}</div>
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{selected.content_md}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const auditScrollRef = useRef(null);
  const auditScrollTopRef = useRef(0);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('jarvis.theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    try {
      localStorage.setItem('jarvis.theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (!auditOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setAuditOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    // Restore scroll position on open
    requestAnimationFrame(() => {
      if (auditScrollRef.current) {
        auditScrollRef.current.scrollTop = auditScrollTopRef.current;
      }
    });

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [auditOpen]);

  useEffect(() => {
    if (!auditOpen) return;
    const el = auditScrollRef.current;
    if (!el) return;

    const onScroll = () => {
      auditScrollTopRef.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [auditOpen]);

  const [auditLog, setAuditLog] = useState([]);
  const [auditStats, setAuditStats] = useState({ total: 0, latestTs: null });

  const [feed, setFeed] = useState([]);

  const [feedQuery, setFeedQuery] = useState('');
  const [feedStatus, setFeedStatus] = useState('running'); // all | running | done | error
  const feedScrollRef = useRef(null);
  const feedScrollTopRef = useRef(0);

  const filteredFeed = useMemo(() => {
    const q = feedQuery.trim().toLowerCase();
    return auditLog
      .map((row) => ({
        id: row.id,
        title: row.name,
        status: 'done',
        ts: row.ts,
        details: row.details,
      }))
      .filter((item) => {
      const statusOk = feedStatus === 'all' ? true : item.status === feedStatus;
      if (!statusOk) return false;
      if (!q) return true;
      const hay = `${item.title}\n${item.details || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [auditLog, feedQuery, feedStatus]);

  // Keep relative times fresh
  useEffect(() => {
    const t = setInterval(() => setFeed((x) => [...x]), 15 * 1000);
    return () => clearInterval(t);
  }, []);

  // Remember Activity Feed scroll position
  useEffect(() => {
    const el = feedScrollRef.current;
    if (!el) return;

    // Restore
    requestAnimationFrame(() => {
      el.scrollTop = feedScrollTopRef.current;
    });

    const onScroll = () => {
      feedScrollTopRef.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [feedQuery, feedStatus]);

  const [latestBrief, setLatestBrief] = useState(null);
  const [upcomingReminders, setUpcomingReminders] = useState([]);

  async function refreshAudit() {
    const rows = await window.bob?.getAudit?.({ limit: 200 });
    const stats = await window.bob?.getAuditStats?.();
    if (rows) {
      setAuditLog(
        rows.map((r) => ({
          id: r.id,
          name: r.action,
          ts: r.created_at,
          details: r.details_json ? JSON.stringify(r.details_json) : '',
        }))
      );
    }
    if (stats) {
      setAuditStats({ total: stats.total || 0, latestTs: stats.latestTs || null });
    }
  }

  async function refreshReminders() {
    const rows = await window.bob?.dashboardReminders?.();
    setUpcomingReminders(rows || []);
  }

  async function refreshConnectionStatus() {
    const google = await window.bob?.googleStatus?.();
    const chatgpt = await window.bob?.chatgptGetConfig?.();
    const gConnected = Boolean(google?.connected);
    setInboxConnected(gConnected);
    setCalendarConnected(gConnected);
    setChatgptConnected(Boolean(chatgpt?.apiKey && String(chatgpt.apiKey).trim()));
  }

  async function refreshReminders() {
    const rows = await window.bob?.dashboardReminders?.();
    setUpcomingReminders(rows || []);
  }

  useEffect(() => {
    refreshAudit();
    refreshBrief();
    refreshReminders();
    const t = setInterval(() => {
      refreshAudit();
      refreshBrief();
      refreshReminders();
    }, 1500);
    return () => clearInterval(t);
  }, []);

  const content = useMemo(() => {
    switch (tab) {
      case 'dashboard':
        return (
          <div className="dashboardLayout">
            <div className="dashboardLeft">
              <GlassCard title="Status">
                <div className="kv">
                  <div className="k">Agent</div><div className="v">JARVIS (local)</div>
                  <div className="k">Mode</div><div className="v">Local-only • SQLite</div>
                  <div className="k">Gmail</div>
                  <div className="v">
                    <span className="badge">
                      <span className="dot bad" />
                      Not connected
                    </span>
                  </div>
                  <div className="k">Calendar</div>
                  <div className="v">
                    <span className="badge">
                      <span className="dot bad" />
                      Not connected
                    </span>
                  </div>
                </div>
              </GlassCard>
              <GlassCard title="Quick Actions">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    onClick={async () => {
                      await window.bob?.requestMorningBrief?.();
                      await refreshAudit();
                      await refreshBrief();
                    }}
                  >
                    Generate Morning Brief
                  </button>
                </div>
              </GlassCard>
              <GlassCard title="Morning Brief (latest)">
                {!latestBrief ? (
                  <div className="tiny" style={{ color: 'var(--muted)' }}>No brief yet.</div>
                ) : (
                  <div className="notesList">
                    {upcomingReminders.slice(0, 6).map((r) => (
                      <div key={r.id} className="notesListItem">
                        <div style={{ fontWeight: 650 }}>{r.title}</div>
                        <div className="tiny" style={{ color: 'var(--muted)' }}>{formatAbsolute(r.start_at)}</div>
                        <div className="tiny" style={{ color: 'var(--muted)' }}>
                          {r.reminder_due ? 'Reminder due now' : `Reminder at ${formatAbsolute(r.reminder_at)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
              <GlassCard title="Upcoming Reminders">
                {upcomingReminders.length === 0 ? (
                  <div className="tiny" style={{ color: 'var(--muted)' }}>No reminders in the next 7 days.</div>
                ) : (
                  <div className="notesList">
                    {upcomingReminders.slice(0, 6).map((r) => (
                      <div key={r.id} className="notesListItem">
                        <div style={{ fontWeight: 650 }}>{r.title}</div>
                        <div className="tiny" style={{ color: 'var(--muted)' }}>{formatAbsolute(r.start_at)}</div>
                        <div className="tiny" style={{ color: 'var(--muted)' }}>
                          {r.reminder_due ? 'Reminder due now' : `Reminder at ${formatAbsolute(r.reminder_at)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>
            <div className="card glass feedCard">
              <div className="cardHeader">
                <div className="cardTitle">Activity Feed</div>
              </div>
              <div className="cardBody" ref={feedScrollRef}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <input
                    value={feedQuery}
                    onChange={(e) => setFeedQuery(e.target.value)}
                    placeholder="Search activity"
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.14)',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--text)',
                      outline: 'none',
                    }}
                  />
                  <select
                    value={feedStatus}
                    onChange={(e) => setFeedStatus(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.14)',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--text)',
                      outline: 'none',
                    }}
                  >
                    <option value="all">All</option>
                    <option value="running">Running</option>
                    <option value="done">Done</option>
                    <option value="error">Errors</option>
                  </select>
                </div>
                <div className="feed">
                  {filteredFeed.map((item) => (
                    <FeedItem key={item.id} item={item} />
                  ))}
                  {filteredFeed.length === 0 ? (
                    <div className="tiny" style={{ color: 'var(--muted)', padding: 10 }}>
                      No matching activity.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      case 'calendar':
        return <CalendarPage />;
      case 'inbox':
        return <InboxPage />;
      case 'classes':
        return <ClassesPage />;
      case 'assignments':
        return <AssignmentsNotesPage />;
      case 'cron':
        return <CronJobsPage />;
      case 'assistant':
        return <GlassCard title="Assistant">Chat UI (bubbles) connected to OpenClaw coming next.</GlassCard>;
      case 'tasks':
        return <TaskBoardPage />;
      case 'settings':
        return (
          <div className="grid">
            <GlassCard title="Theme">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>Choose app theme</div>
                <button className="btn" onClick={() => setTheme('dark')} disabled={theme === 'dark'}>
                  Dark
                </button>
                <button className="btn" onClick={() => setTheme('light')} disabled={theme === 'light'}>
                  Light
                </button>
              </div>
            </GlassCard>
            <GlassCard title="Audit Log">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="tiny" style={{ color: 'var(--muted)' }}>
                  Entries: {auditStats.total} {auditStats.latestTs ? `• latest ${formatRelative(auditStats.latestTs)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => setAuditOpen(true)}>Open Audit Log</button>
                  <button
                    className="btn ghost"
                    onClick={async () => {
                      await window.bob?.clearAudit?.();
                      await refreshAudit();
                    }}
                  >
                    Clear Audit Log
                  </button>
                </div>
              </div>
            </GlassCard>
            <GlassCard title="VPS Sync">
              <VpsSyncSettings />
            </GlassCard>
            <GlassCard title="ChatGPT">
              <ChatGPTSettings />
            </GlassCard>
            <GlassCard title="ChatGPT">
              <ChatGPTSettings />
            </GlassCard>
          </div>
        );
      default:
        return null;
    }
  }, [tab, filteredFeed, feedQuery, feedStatus, latestBrief, theme, auditStats]);

  return (
    <div className="appRoot">
      {auditOpen ? (
        <>
          <div className="drawerOverlay" onClick={() => setAuditOpen(false)} />
          <div className="drawer glass" role="dialog" aria-label="Audit Log">
            <div className="drawerHeader">
              <div className="drawerTitle">Audit Log</div>
              <button className="btn" onClick={() => setAuditOpen(false)}>
                Close
              </button>
            </div>
            <div className="drawerBody" ref={auditScrollRef}>
              {auditLog.map((row) => (
                <div key={row.id} className="logRow">
                  <div className="logTop">
                    <div className="logName">{row.name}</div>
                    <div className="logMeta" title={formatAbsolute(row.ts)}>
                      {formatRelative(row.ts)}
                      {shouldShowAbsolute(row.ts) ? ` • ${formatAbsolute(row.ts)}` : ''}
                    </div>
                  </div>
                  {row.details ? <div className="logDetails">{row.details}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
      <aside className={`sidebar glass ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brandTitle">JARVIS</div>
          <button
            className="btn ghost"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="nav">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`navItem ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
              title={t.label}
            >
              <t.icon size={18} style={{ flex: '0 0 auto' }} aria-hidden />
              <span className="navLabel">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebarFooter">
          <div className="tiny">Audit log: {auditStats.total} entries</div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar glass">
          <div className="topbarLeft">{tabs.find((t) => t.key === tab)?.label}</div>
          <div className="topbarRight statusBar">
            <span className="badge statusBadge"><span className={`dot ${inboxConnected ? 'good' : 'bad'}`} />Inbox: {inboxConnected ? 'Connected' : 'Not connected'}</span>
            <span className="badge statusBadge"><span className={`dot ${calendarConnected ? 'good' : 'bad'}`} />Calendar: {calendarConnected ? 'Connected' : 'Not connected'}</span>
            <span className="badge statusBadge"><span className={`dot ${chatgptConnected ? 'good' : 'bad'}`} />ChatGPT: {chatgptConnected ? 'Connected' : 'Not connected'}</span>
          </div>
        </header>
        <section className="content">{content}</section>
      </main>
    </div>
  );
}
