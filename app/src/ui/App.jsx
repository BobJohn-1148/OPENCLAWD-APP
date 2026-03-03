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

function VpsSyncSettings() {
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const cfg = await window.bob?.syncGetConfig?.();
      if (cfg) {
        setEnabled(Boolean(cfg.enabled));
        setBaseUrl(cfg.baseUrl || '');
      }
    })();
  }, []);

  return (
    <div>
      <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
        Optional. When enabled, the app will poll the VPS outbox every 30s and store results locally.
        Planned base URL: https://&lt;ip&gt;:4443
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="tiny" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enable sync
        </label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://187.124.76.51:4443"
          style={{
            flex: 1,
            minWidth: 260,
            padding: '10px 12px',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        <button
          className="btn"
          onClick={async () => {
            setStatus('Saving…');
            try {
              await window.bob?.syncSetConfig?.({ enabled, baseUrl });
              setStatus('Saved.');
            } catch (e) {
              setStatus(String(e?.message || e));
            }
          }}
        >
          Save
        </button>
        <button
          className="btn"
          onClick={async () => {
            setStatus('Syncing…');
            try {
              const res = await window.bob?.syncRunOnce?.();
              setStatus(res?.ok ? `Synced (added ${res.added || 0}).` : `Sync failed: ${res?.reason || 'unknown'}`);
            } catch (e) {
              setStatus(String(e?.message || e));
            }
          }}
          disabled={!enabled || !baseUrl.trim()}
        >
          Sync now
        </button>
      </div>
      {status ? <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>{status}</div> : null}
    </div>
  );
}

function TelegramSettings() {
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const cfg = await window.bob?.telegramGetConfig?.();
      if (cfg?.token) {
        setHasToken(true);
        setToken('');
      }
    })();
  }, []);

  return (
    <div>
      <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 10 }}>
        Sends the daily brief to Telegram user id 1441348235 at 7:30am America/Chicago (while the app is running).
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={hasToken ? 'Token saved (paste a new token to replace)' : 'Paste Telegram bot token'}
          style={{
            flex: 1,
            minWidth: 260,
            padding: '10px 12px',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        <button
          className="btn"
          onClick={async () => {
            setStatus('Saving…');
            try {
              await window.bob?.telegramSetToken?.(token);
              setHasToken(true);
              setToken('');
              setStatus('Saved.');
            } catch (e) {
              setStatus(String(e?.message || e));
            }
          }}
          disabled={!token.trim()}
        >
          Save
        </button>
        <button
          className="btn"
          onClick={async () => {
            setStatus('Sending test…');
            try {
              await window.bob?.telegramSendTest?.();
              setStatus('Queued test message.');
            } catch (e) {
              setStatus(String(e?.message || e));
            }
          }}
        >
          Send test
        </button>
      </div>
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
      return localStorage.getItem('bob.theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');

    try {
      localStorage.setItem('bob.theme', theme);
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

  async function refreshBrief() {
    const b = await window.bob?.getLatestBrief?.();
    setLatestBrief(b);
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
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{latestBrief.title || 'Morning Brief'}</div>
                    <div className="tiny" style={{ color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                      {(latestBrief.blocks || []).map((b, i) => `• ${b.text}`).join('\n')}
                    </div>
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
            <GlassCard title="Integrations">
              <TelegramSettings />
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
          <div className="topbarRight">
            <button className="btn ghost" onClick={() => setAuditOpen(true)}>
              Audit Log
            </button>
            <button
              className="btn ghost"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title="Toggle theme"
            >
              Theme: {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
            <button
              className="btn ghost"
              onClick={() => window.bob?.openExternal('https://thehackernews.com/')}
              title="Open The Hacker News"
            >
              TheHackerNews
            </button>
          </div>
        </header>
        <section className="content">{content}</section>
      </main>
    </div>
  );
}
