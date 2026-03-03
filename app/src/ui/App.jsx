import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Mail,
  GraduationCap,
  Clock,
  Bot,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const tabs = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'inbox', label: 'Inbox', icon: Mail },
  { key: 'assignments', label: 'Assignments', icon: GraduationCap },
  { key: 'cron', label: 'Cron Jobs', icon: Clock },
  { key: 'assistant', label: 'Assistant', icon: Bot },
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

  async function refreshAudit() {
    const rows = await window.bob?.getAudit?.({ limit: 200 });
    if (!rows) return;
    setAuditLog(
      rows.map((r) => ({
        id: r.id,
        name: r.action,
        ts: r.created_at,
        details: r.details_json ? JSON.stringify(r.details, null, 2) : '',
      }))
    );
  }

  async function refreshBrief() {
    const b = await window.bob?.getLatestBrief?.();
    setLatestBrief(b);
  }

  useEffect(() => {
    refreshAudit();
    refreshBrief();
    const t = setInterval(() => {
      refreshAudit();
      refreshBrief();
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
                  <div className="k">Agent</div><div className="v">Bob (local)</div>
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
        return <GlassCard title="Calendar">Google Calendar integration coming next.</GlassCard>;
      case 'inbox':
        return <GlassCard title="Inbox">Gmail viewer + summary panel coming next.</GlassCard>;
      case 'assignments':
        return <GlassCard title="Assignments">Blackboard scrape + due-soon list coming next.</GlassCard>;
      case 'cron':
        return <GlassCard title="Cron Jobs">Scheduled jobs + next run/last run pulled from OpenClaw coming next.</GlassCard>;
      case 'assistant':
        return <GlassCard title="Assistant">Chat UI (bubbles) connected to OpenClaw coming next.</GlassCard>;
      case 'settings':
        return (
          <div className="grid">
            <GlassCard title="Appearance">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>Theme</div>
                <button className="btn" onClick={() => setTheme('dark')} disabled={theme === 'dark'}>
                  Dark
                </button>
                <button className="btn" onClick={() => setTheme('light')} disabled={theme === 'light'}>
                  Light
                </button>
              </div>
            </GlassCard>
            <GlassCard title="Integrations">
              <TelegramSettings />
            </GlassCard>
          </div>
        );
      default:
        return null;
    }
  }, [tab]);

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
          <div className="brandTitle">Bob Assistant</div>
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
          <div className="tiny">Audit log: pending</div>
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
