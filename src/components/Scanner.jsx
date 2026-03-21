import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Badge, Toggle, Card, Alert, cn } from './ui';
import { api } from '../utils/api';

const SCAN_MS = 900;

function computeMotion(prev, curr) {
  if (!prev || !curr || prev.length !== curr.length) return 1;
  let diff = 0;
  const n = Math.min(prev.length, 2400);
  for (let i = 0; i < n; i++) diff += Math.abs(prev[i] - curr[i]);
  return diff / n / 255;
}

export default function Scanner() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const prevPx    = useRef(null);
  const fpsRef    = useRef({ n: 0, t: Date.now() });

  const [mode,       setMode]       = useState('entry');
  const [paused,     setPaused]     = useState(false);
  const [facing,     setFacing]     = useState('user');
  const [detections, setDetections] = useState([]);
  const [log,        setLog]        = useState([]);
  const [fps,        setFps]        = useState(0);
  const [active,     setActive]     = useState(false);
  const [motion,     setMotion]     = useState(1);

  const drawBoxes = useCallback((dets, cW, cH) => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = cW; c.height = cH;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);
    const scale = Math.min(cW / 320, cH / 240);
    const offX = (cW - 320 * scale) / 2;
    const offY = (cH - 240 * scale) / 2;
    dets.forEach(d => {
      if (!d.bbox) return;
      const [x1,y1,x2,y2] = d.bbox;
      const rx1 = offX + x1*scale, ry1 = offY + y1*scale;
      const rw = (x2-x1)*scale, rh = (y2-y1)*scale;
      const isSpoof = d.reason === 'spoof';
      const isKnown = d.name !== 'Unknown' && !isSpoof;
      const color = isSpoof ? '#eab308' : isKnown ? '#22c55e' : '#ef4444';
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.strokeRect(rx1, ry1, rw, rh);
      ctx.font = 'bold 10px Inter, sans-serif';
      const label = isSpoof ? '⚠ SPOOF' : `${d.name}  ${d.confidence}%`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color + 'dd';
      ctx.fillRect(rx1, ry1 - 18, tw + 8, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, rx1 + 4, ry1 - 5);
      if (d.event_type && !isSpoof) {
        const tag = d.event_type.toUpperCase() + (d.logged ? ' ✓' : '');
        const tw2 = ctx.measureText(tag).width;
        ctx.fillStyle = color + 'cc';
        ctx.fillRect(rx1, ry1+rh, tw2+8, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(tag, rx1+4, ry1+rh+13);
      }
    });
  }, []);

  const scan = useCallback(async () => {
    if (paused || !webcamRef.current) return;
    const src = webcamRef.current.getScreenshot({ width: 320, height: 240 });
    if (!src) return;
    // Motion check
    try {
      const tmp = document.createElement('canvas');
      tmp.width = 64; tmp.height = 48;
      const tctx = tmp.getContext('2d');
      const img = new Image(); img.src = src;
      await new Promise(r => { img.onload = r; });
      tctx.drawImage(img, 0, 0, 64, 48);
      const px = tctx.getImageData(0, 0, 64, 48).data;
      const m = computeMotion(prevPx.current, px);
      prevPx.current = px;
      setMotion(m);
    } catch {}
    try {
      const blob = await (await fetch(src)).blob();
      const form = new FormData();
      form.append('image', blob, 'f.jpg');
      form.append('event_type', mode);
      const res  = await api.scan(form);
      const dets = res.detections || [];
      setDetections(dets);
      setActive(true);
      const cont = canvasRef.current?.parentElement;
      if (cont) drawBoxes(dets, cont.clientWidth, cont.clientHeight);
      const marked = dets.filter(d => d.logged);
      if (marked.length) {
        const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLog(p => [...marked.map(d => ({ ...d, ts })), ...p].slice(0, 40));
      }
      fpsRef.current.n++;
      const now = Date.now();
      if (now - fpsRef.current.t >= 3000) {
        setFps(Math.round(fpsRef.current.n / ((now - fpsRef.current.t) / 1000)));
        fpsRef.current = { n: 0, t: now };
      }
    } catch {}
  }, [paused, mode, drawBoxes]);

  useEffect(() => {
    const t = setInterval(scan, SCAN_MS);
    return () => clearInterval(t);
  }, [scan]);

  const motionOk = motion > 0.008;
  const motionLow = motion > 0.003 && !motionOk;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Live Scanner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Continuous detection · {fps > 0 ? `${fps} fps` : 'starting…'}
        </p>
      </div>

      {/* Spoof warning */}
      {!motionOk && !motionLow && (
        <Alert variant="warning">
          <span>⚠</span>
          <div>
            <p className="font-medium">Possible photo or screen detected</p>
            <p className="text-xs mt-0.5 opacity-80">No motion detected. Ensure a live person is in frame.</p>
          </div>
        </Alert>
      )}

      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground flex-shrink-0">Mode</span>
        <Toggle
          value={mode}
          onChange={setMode}
          options={[{ value: 'entry', label: '→ Entry' }, { value: 'exit', label: '← Exit' }]}
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`dot ${motionOk ? 'dot-green' : motionLow ? 'dot-yellow' : 'dot-red'} ${active && !paused && motionOk ? 'dot-pulse' : ''}`} />
          <span>{motionOk ? 'Live' : motionLow ? 'Low motion' : 'Static'}</span>
        </div>
      </div>

      {/* Camera */}
      <div className="camera-wrapper" style={{ aspectRatio: '4/3' }}>
        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ width: 320, height: 240, facingMode: facing }}
          mirrored={facing === 'user'}
          className="cam-contain"
        />
        <canvas ref={canvasRef} className="bbox-layer" />
        {active && !paused && motionOk && <div className="scan-line" />}
        {/* Motion indicator */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border">
          <div
            className={cn('h-full transition-all', motionOk ? 'bg-green-500' : motionLow ? 'bg-yellow-500' : 'bg-red-500')}
            style={{ width: `${Math.min(100, motion * 8000)}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button variant={paused ? 'default' : 'outline'} size="sm" onClick={() => setPaused(p => !p)}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}>
          ⟳ Flip
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setLog([]); setDetections([]); }}>
          Clear
        </Button>
      </div>

      {/* Live face chips */}
      {detections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {detections.map((d, i) => {
            const isSpoof = d.reason === 'spoof';
            const isKnown = !isSpoof && d.name !== 'Unknown';
            return (
              <div key={i} className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-xs font-medium',
                isSpoof ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300' :
                isKnown ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300' :
                         'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              )}>
                <span>{isSpoof ? '⚠' : isKnown ? '✓' : '?'}</span>
                {d.name} · {d.confidence}%
              </div>
            );
          })}
        </div>
      )}

      {/* Event log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Attendance Events</h2>
          <Badge variant={mode === 'entry' ? 'green' : 'yellow'}>{mode === 'entry' ? '→ Entry' : '← Exit'}</Badge>
        </div>
        {log.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No events yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Identified faces will appear here</p>
          </div>
        ) : (
          <Card>
            {log.slice(0, 15).map((d, i) => (
              <div key={i} className={cn('flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors', i < log.length - 1 ? 'border-b border-border' : '')}>
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  d.name !== 'Unknown' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-muted text-muted-foreground'
                )}>
                  {d.name !== 'Unknown' ? d.name[0].toUpperCase() : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">{[d.student_id, d.department].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge variant={d.event_type === 'entry' ? 'green' : 'yellow'}>{d.event_type}</Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{d.ts}</span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
