import React, { useState, useEffect } from 'react';
import { Button, Card, CardHeader, CardTitle, CardBody, Alert, Spinner, Badge, cn } from './ui';
import { api } from '../utils/api';

const GROQ_MODELS = [
  { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B Instant',  desc: 'Fastest, recommended',    rec: true },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',         desc: 'Best quality, slower' },
  { id: 'mixtral-8x7b-32768',      label: 'Mixtral 8×7B',          desc: 'Great for data queries' },
  { id: 'gemma2-9b-it',            label: 'Gemma 2 9B',            desc: 'Balanced, Google model' },
];

const OLLAMA_MODELS = [
  { id: 'llama3.2:1b',  label: 'Llama 3.2 1B',   desc: 'Best for old CPUs (i7-3770)', rec: true },
  { id: 'qwen2.5:1.5b', label: 'Qwen 2.5 1.5B',  desc: 'Better data queries, ~900MB' },
  { id: 'phi3.5:mini',  label: 'Phi 3.5 Mini',   desc: 'Microsoft, needs 12GB RAM' },
  { id: 'llama3.2:3b',  label: 'Llama 3.2 3B',   desc: 'Better answers, needs 8GB' },
];

function ModelPicker({ models, value, onChange, accent }) {
  return (
    <div className="space-y-2">
      {models.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left transition-colors',
            value === m.id
              ? 'border-foreground bg-secondary'
              : 'border-border hover:bg-muted'
          )}
        >
          <div className={cn(
            'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
            value === m.id ? 'border-foreground' : 'border-muted-foreground/40'
          )}>
            {value === m.id && <div className="w-2 h-2 rounded-full bg-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{m.label}</span>
              {m.rec && <Badge variant="green">Recommended</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function Settings({ health }) {
  const [groqModel,  setGroqModel]  = useState('llama-3.1-8b-instant');
  const [ollModel,   setOllModel]   = useState('llama3.2:1b');
  const [saved,      setSaved]      = useState(false);
  const [resetting,  setResetting]  = useState(false);
  const [resetMsg,   setResetMsg]   = useState('');

  useEffect(() => {
    const g = localStorage.getItem('presenza_groq_model');
    const o = localStorage.getItem('presenza_ollama_model');
    if (g) setGroqModel(g);
    if (o) setOllModel(o);
  }, []);

  const save = () => {
    localStorage.setItem('presenza_groq_model', groqModel);
    localStorage.setItem('presenza_ollama_model', ollModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = async () => {
    if (!window.confirm('Mark all students as absent?')) return;
    setResetting(true);
    try { await api.resetPresence(); setResetMsg('Done — all marked absent.'); }
    catch (e) { setResetMsg(`Error: ${e.message}`); }
    finally { setResetting(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">System configuration</p>
      </div>

      {/* Status */}
      <Card>
        <CardHeader><CardTitle>System Status</CardTitle></CardHeader>
        <CardBody className="space-y-2.5">
          {[
            { label: 'Backend (Railway)', ok: health?.ok, val: health?.ok ? `${health.users} students` : 'Offline — check Railway' },
            { label: 'Face Model (HF Space)', ok: !!health?.hf, val: health?.hf ? 'Active' : 'Not configured' },
            { label: 'Scan interval', ok: true, val: '900ms' },
            { label: 'Anti-spoof', ok: true, val: 'Motion + MiniFASNet + LBP + FFT' },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                <span className={`dot ${s.ok ? 'dot-green' : 'dot-red'}`} />
                <span className="text-sm">{s.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{s.val}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Groq models */}
      <Card>
        <CardHeader>
          <CardTitle>☁ Groq Model</CardTitle>
          <span className="text-xs text-muted-foreground">Free 14k req/day</span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-muted-foreground mb-3">Get free key at <span className="underline">console.groq.com</span> → set GROQ_API_KEY in Railway</p>
          <ModelPicker models={GROQ_MODELS} value={groqModel} onChange={setGroqModel} />
        </CardBody>
      </Card>

      {/* Ollama models */}
      <Card>
        <CardHeader>
          <CardTitle>⚡ Ollama Model</CardTitle>
          <span className="text-xs text-muted-foreground">100% offline</span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-muted-foreground mb-1">Install: <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">ollama.com</code></p>
          <p className="text-xs text-muted-foreground mb-3">Then run: <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">ollama pull {ollModel} && ollama serve</code></p>
          <ModelPicker models={OLLAMA_MODELS} value={ollModel} onChange={setOllModel} />
          <Button className="w-full mt-4" size="sm" onClick={save}>
            {saved ? '✓ Saved!' : 'Save Model Preferences'}
          </Button>
        </CardBody>
      </Card>

      {/* Anti-spoof layers */}
      <Card>
        <CardHeader><CardTitle>Anti-Spoof Layers</CardTitle></CardHeader>
        <CardBody>
          {[
            { icon: '🎥', label: 'Motion Detection', desc: 'Client-side pixel diff — blocks static photos instantly' },
            { icon: '🧠', label: 'MiniFASNetV2', desc: 'Deep neural net trained on photo/screen/replay attacks' },
            { icon: '🔆', label: 'LBP Texture', desc: 'Real skin has micro-texture; printed photos are smooth' },
            { icon: '📊', label: 'FFT Frequency', desc: 'Moiré patterns from screens detected in frequency domain' },
            { icon: '🎨', label: 'Color Analysis', desc: 'Screens over-saturate; real skin has natural tones' },
          ].map((r, i, arr) => (
            <div key={r.label} className={cn('flex gap-3 py-3', i < arr.length - 1 ? 'border-b border-border' : '')}>
              <span className="text-lg flex-shrink-0">{r.icon}</span>
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader><CardTitle className="text-destructive">Danger Zone</CardTitle></CardHeader>
        <CardBody>
          <p className="text-xs text-muted-foreground mb-3">Reset marks everyone absent. Records are kept.</p>
          {resetMsg && <Alert variant={resetMsg.startsWith('Error') ? 'error' : 'success'} className="mb-3">{resetMsg}</Alert>}
          <Button variant="destructive" className="w-full" onClick={reset} disabled={resetting}>
            {resetting ? <><Spinner size={14} /> Resetting…</> : '↺ Reset All Presence'}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
