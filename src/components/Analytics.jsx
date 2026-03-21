import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, CardHeader, CardTitle, CardBody, Badge, Alert, Spinner, SectionHeader, cn } from './ui';
import { api } from '../utils/api';

function arr(d) { return Array.isArray(d) ? d : (d?.results || []); }

const QUERIES = [
  "When did Yash arrive today?",
  "Who was absent last 5 days?",
  "Who entered between 4pm and 6pm?",
  "List students present right now",
  "What is the attendance rate today?",
];

export default function Analytics() {
  const [data,      setData]      = useState(null);
  const [sessions,  setSessions]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [aiMode,    setAiMode]    = useState('groq');
  const [query,     setQuery]     = useState('');
  const [insight,   setInsight]   = useState('');
  const [aiLoad,    setAiLoad]    = useState(false);
  const [aiErr,     setAiErr]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [a, s] = await Promise.all([api.analytics(), api.sessions({ date: today, limit: 30 })]);
      setData(a); setSessions(arr(s));
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runQuery = async (q = query) => {
    if (!q.trim()) return;
    setAiLoad(true); setInsight(''); setAiErr('');
    try {
      const r = await api.semanticQuery(q.trim(), aiMode);
      setInsight(r.answer || r.insight || '');
    } catch (e) { setAiErr(e.message); }
    finally { setAiLoad(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-52">
      <Spinner size={22} className="text-muted-foreground" />
    </div>
  );

  const {
    total_users = 0, present_today = 0, attendance_rate = 0,
    week_data = [], top_attendees = [],
    week_avg = 0, late_today = 0,
    week_total = 0, avg_duration_min = null,
  } = data || {};

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Attendance patterns &amp; AI-powered insights</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>↺</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Rate Today', value: `${attendance_rate}%`, sub: `${present_today} of ${total_users}` },
          { label: 'Week Total', value: week_total, sub: `avg ${week_avg}/day` },
          { label: 'Late Today', value: late_today, sub: 'after 9:00 AM' },
          { label: 'Avg Session', value: avg_duration_min ? `${avg_duration_min}m` : '—', sub: 'today' },
        ].map(s => (
          <div key={s.label} className="border border-border rounded-xl p-4">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-lg font-semibold tabular-nums mt-1">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 7-day */}
      {week_data.length > 0 && (
        <Card>
          <CardHeader><CardTitle>7-Day Trend</CardTitle><span className="text-xs text-muted-foreground">avg {week_avg}/day</span></CardHeader>
          <CardBody>
            <div className="flex items-end gap-1" style={{ height: 72 }}>
              {week_data.map((d, i) => {
                const max = Math.max(...week_data.map(x => x.count), 1);
                const h = Math.max(Math.round((d.count / max) * 56), d.count > 0 ? 3 : 0);
                const isToday = i === week_data.length - 1;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    {d.count > 0 && <span className="text-[9px] text-muted-foreground">{d.count}</span>}
                    <div className={cn('w-full rounded-sm', isToday ? 'bg-foreground/80' : 'bg-muted-foreground/25')} style={{ height: h || 2 }} />
                    <span className="text-[9px] text-muted-foreground">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Sessions */}
      {sessions.length > 0 && (
        <div>
          <SectionHeader title="Sessions Today" />
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[320px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    {['Name', 'Entry', 'Exit', 'Duration'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-medium">{s.user_name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{new Date(s.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{s.exit_time ? new Date(s.exit_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <Badge variant="green">Active</Badge>}</td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{s.duration_minutes ? `${s.duration_minutes}m` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Top attendees */}
      {top_attendees.length > 0 && (
        <div>
          <SectionHeader title="Top Attendees" />
          <Card>
            {top_attendees.map((t, i) => (
              <div key={i} className={cn('flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors', i < top_attendees.length - 1 ? 'border-b border-border' : '')}>
                <span className="text-sm w-6 text-center">{i === 0 ? '🥇' : `#${i + 1}`}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.user__name}</p>
                  {t.user__student_id && <p className="text-[11px] text-muted-foreground">{t.user__student_id}</p>}
                </div>
                <span className="text-sm font-semibold tabular-nums">{t.total}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* AI Intelligence */}
      <div>
        <SectionHeader title="AI Intelligence" />
        <Card>
          <CardBody className="space-y-3">
            {/* Mode */}
            <div className="flex items-center gap-2">
              {['groq', 'ollama'].map(m => (
                <button key={m} onClick={() => setAiMode(m)}
                  className={cn('text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors', aiMode === m ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-foreground/40')}>
                  {m === 'groq' ? '☁ Groq' : '⚡ Ollama'}
                </button>
              ))}
              <span className="text-[11px] text-muted-foreground ml-auto">
                {aiMode === 'groq' ? 'Free 14k req/day' : 'Fully offline'}
              </span>
            </div>

            {/* Example chips */}
            <div className="flex flex-wrap gap-1.5">
              {QUERIES.map(q => (
                <button key={q} onClick={() => { setQuery(q); runQuery(q); }}
                  className="text-xs border border-border rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
                  {q}
                </button>
              ))}
            </div>

            {/* Custom query */}
            <div className="flex gap-2">
              <input
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Ask anything about attendance…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runQuery()}
              />
              <Button size="sm" onClick={() => runQuery()} disabled={aiLoad}>
                {aiLoad ? <Spinner size={14} /> : '→'}
              </Button>
            </div>

            {aiErr && <Alert variant="error">⚠ {aiErr}</Alert>}

            {insight && (
              <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{aiMode.toUpperCase()} Analysis</p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{insight}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
