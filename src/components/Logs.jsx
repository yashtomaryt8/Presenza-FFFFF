import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Input, Select, Badge, Spinner, Alert, Empty, Toggle, cn } from './ui';
import { api } from '../utils/api';

function today() { return new Date().toISOString().slice(0, 10); }
function arr(d) { return Array.isArray(d) ? d : (d?.results || []); }

export default function Logs() {
  const [tab,     setTab]     = useState('logs');
  const [logs,    setLogs]    = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');
  const [filters, setFilters] = useState({ name: '', event: '', date: today() });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (filters.name)  params.name  = filters.name;
      if (filters.event) params.event = filters.event;
      if (filters.date)  params.date  = filters.date;
      const [l, u] = await Promise.all([api.logs(params), api.users()]);
      setLogs(arr(l)); setUsers(arr(u)); setErr('');
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const deleteUser = async (id, name) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    try { await api.deleteUser(id); load(); } catch (e) { setErr(e.message); }
  };

  const exportCSV = async () => {
    try {
      const res  = await api.exportCSV(filters.date || today());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `presenza_${filters.date}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
  };

  const sf = (k, v) => setFilters(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Logs & Students</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Filter, export, and manage records</p>
      </div>

      <Toggle
        value={tab}
        onChange={setTab}
        options={[
          { value: 'logs',  label: `Logs (${logs.length})` },
          { value: 'users', label: `Students (${users.length})` },
        ]}
      />

      {err && <Alert variant="error">⚠ {err}</Alert>}

      {tab === 'logs' && (
        <Card>
          <div className="p-4 space-y-3 border-b border-border">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Search name…" value={filters.name} onChange={e => sf('name', e.target.value)} />
              <Select value={filters.event} onChange={e => sf('event', e.target.value)}>
                <option value="">All events</option>
                <option value="entry">Entry</option>
                <option value="exit">Exit</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <input type="date" value={filters.date} onChange={e => sf('date', e.target.value)}
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <Button variant="outline" size="sm" onClick={exportCSV}>↓ CSV</Button>
              <Button variant="ghost" size="sm" onClick={load}>↺</Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Spinner size={20} className="text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <Empty icon="≡" title="No records" sub="Try changing the filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    {['Name', 'ID', 'Dept', 'Event', 'Time', 'Conf'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-medium">{l.user_name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{l.user_student_id || '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{l.department || '—'}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={l.event_type === 'entry' ? 'green' : 'yellow'}>{l.event_type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">
                        {new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">
                        {l.confidence ? `${(l.confidence * 100).toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'users' && (
        <Card>
          {users.length === 0 ? (
            <Empty icon="+" title="No students registered" />
          ) : (
            users.map((u, i) => (
              <div key={u.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors', i < users.length - 1 ? 'border-b border-border' : '')}>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                  {u.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-[11px] text-muted-foreground">{[u.student_id, u.department].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={u.photo_count >= 5 ? 'green' : 'yellow'}>{u.photo_count}p</Badge>
                  <Badge variant={u.is_present ? 'green' : 'secondary'}>{u.is_present ? 'In' : 'Out'}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => deleteUser(u.id, u.name)}
                    className="w-7 h-7 text-muted-foreground hover:text-destructive">
                    ✕
                  </Button>
                </div>
              </div>
            ))
          )}
        </Card>
      )}
    </div>
  );
}
