import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, StatCard, SectionHeader, Spinner, Alert, cn } from './ui';
import { api } from '../utils/api';

function Bar({ data, h = 56, highlightLast = true }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1" style={{ height: h + 20 }}>
      {data.map((d, i) => {
        const barH = Math.max(Math.round((d.count / max) * h), d.count > 0 ? 3 : 0);
        const isLast = highlightLast && i === data.length - 1;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            {d.count > 0 && <span className="text-[9px] text-muted-foreground tabular-nums">{d.count}</span>}
            <div
              className={cn('w-full rounded-sm transition-all', isLast ? 'bg-foreground/80' : 'bg-muted-foreground/25')}
              style={{ height: barH || 2 }}
              title={`${d.label ?? d.date}: ${d.count}`}
            />
            <span className="text-[9px] text-muted-foreground">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard({ setTab }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  const load = useCallback(async () => {
    try { setData(await api.analytics()); setErr(''); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-52">
      <Spinner size={22} className="text-muted-foreground" />
    </div>
  );

  if (err) return (
    <div className="space-y-3">
      <Alert variant="error">⚠ {err} — is the backend running?</Alert>
      <Button variant="outline" onClick={load}>Retry</Button>
    </div>
  );

  const {
    total_users = 0, present_now = 0, present_today = 0,
    attendance_rate = 0, late_today = 0,
    week_data = [], week_avg = 0, hourly_data = [],
    peak_hour = '—', top_attendees = [],
    present_users = [], avg_duration_min = null,
  } = data || {};

  const rateColor = attendance_rate >= 75 ? '#22c55e' : attendance_rate >= 50 ? '#eab308' : '#ef4444';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Button onClick={() => setTab('scanner')}>
          ◎ Open Scanner
        </Button>
        <Button variant="outline" onClick={() => setTab('register')}>
          + Register Student
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="👥" label="Registered"    value={total_users}   sub="students total" />
        <StatCard icon="✅" label="Present Now"   value={present_now}   sub="in room" />
        <StatCard icon="📅" label="Today"         value={present_today} sub={`of ${total_users}`} />
        <StatCard icon="⏰" label="Late Arrivals" value={late_today}    sub="after 9 AM" />
      </div>

      {/* Attendance rate */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">Attendance Rate</p>
              <p className="text-xs text-muted-foreground mt-0.5">Weekly avg: {week_avg}/day{avg_duration_min ? ` · Avg session: ${avg_duration_min}min` : ''}</p>
            </div>
            <span className="text-xl font-bold tabular-nums" style={{ color: rateColor }}>
              {attendance_rate}%
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${attendance_rate}%`, background: rateColor }} />
          </div>
        </CardBody>
      </Card>

      {/* 7-day chart */}
      {week_data.length > 0 && (
        <Card>
          <CardHeader><CardTitle>7-Day Attendance</CardTitle></CardHeader>
          <CardBody><Bar data={week_data} h={56} /></CardBody>
        </Card>
      )}

      {/* Hourly chart */}
      {hourly_data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Today — Hourly</CardTitle>
            <span className="text-xs text-muted-foreground">Peak {peak_hour}</span>
          </CardHeader>
          <CardBody>
            <div className="flex items-end gap-0.5" style={{ height: 56 }}>
              {hourly_data.map((d, i) => {
                const max = Math.max(...hourly_data.map(x => x.count), 1);
                const h = Math.max(Math.round((d.count / max) * 44), d.count > 0 ? 2 : 0);
                const isHot = d.count >= max * 0.7 && d.count > 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={cn('w-full rounded-sm', isHot ? 'bg-yellow-500/70' : 'bg-muted-foreground/20')}
                      style={{ height: h || 2 }}
                      title={`${d.label}: ${d.count}`}
                    />
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Currently present */}
      <div>
        <SectionHeader title="Currently Present" action={present_now > 0 ? `${present_now} in room` : undefined} />
        {present_users.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">Nobody marked present</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Open the scanner to start marking attendance</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {present_users.map(u => (
              <div key={u.id} className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-full text-xs hover:bg-muted transition-colors">
                <span className="dot dot-green" style={{ width: 5, height: 5 }} />
                {u.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top attendees */}
      {top_attendees.length > 0 && (
        <div>
          <SectionHeader title="Top Attendees" />
          <Card>
            {top_attendees.map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                <span className="text-sm w-6 text-center text-muted-foreground">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.user__name}</p>
                  {t.user__student_id && <p className="text-[11px] text-muted-foreground">{t.user__student_id}</p>}
                </div>
                <Badge variant="secondary">{t.total} sessions</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
