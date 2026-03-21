import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { Spinner, Alert } from './ui';

const EXAMPLES = [
  { icon: '🕐', text: "When did Yash arrive today?" },
  { icon: '📅', text: "Who was absent last 5 days?" },
  { icon: '⏰', text: "Who entered between 4pm and 6pm?" },
  { icon: '📊', text: "What is the attendance rate today?" },
  { icon: '👥', text: "List students present right now" },
  { icon: '📉', text: "On which days was Sneha absent?" },
];

export default function GlobalSearch({ onClose }) {
  const [q,       setQ]       = useState('');
  const [mode,    setMode]    = useState('groq');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [err,     setErr]     = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const esc = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const run = async (query = q) => {
    if (!query.trim()) return;
    setLoading(true); setResult(null); setErr('');
    try {
      const r = await api.semanticQuery(query.trim(), mode);
      setResult({ answer: r.answer, data: r.data, query: query.trim() });
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="search-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-box">
        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
          <span className="text-muted-foreground text-base flex-shrink-0">⌕</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Ask anything about attendance…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {['groq', 'ollama'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border transition-colors ${
                  mode === m
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40'
                }`}
              >
                {m}
              </button>
            ))}
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground text-sm">✕</button>
          </div>
        </div>

        {/* Examples */}
        {!result && !loading && (
          <div className="p-3 border-b border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Try asking…</p>
            <div className="grid grid-cols-1 gap-0.5">
              {EXAMPLES.map(e => (
                <button
                  key={e.text}
                  onClick={() => { setQ(e.text); run(e.text); }}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
                >
                  <span className="flex-shrink-0">{e.icon}</span>
                  {e.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner size={16} /> Thinking…
          </div>
        )}

        {/* Error */}
        {err && (
          <div className="p-3">
            <Alert variant="error"><span>⚠</span>{err}</Alert>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="p-3 space-y-3">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {mode.toUpperCase()} · "{result.query}"
              </p>
              <div className="border border-border rounded-lg p-3 bg-muted/30">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{result.answer}</p>
              </div>
            </div>

            {result.data?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Data ({result.data.length} records)
                </p>
                <div className="border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {result.data.slice(0, 15).map((d, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-muted/50">
                      <span className="text-sm font-medium text-foreground">{d.name || d.user_name}</span>
                      {d.event_type && <span className="text-xs text-muted-foreground">{d.event_type}</span>}
                      {d.timestamp && <span className="text-xs text-muted-foreground ml-auto">{new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setResult(null); setQ(''); inputRef.current?.focus(); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Ask another question
            </button>
          </div>
        )}

        {/* Footer hint */}
        <div className="px-3 py-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><kbd className="font-mono bg-muted border border-border rounded px-1">↵</kbd> Search</span>
          <span><kbd className="font-mono bg-muted border border-border rounded px-1">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
