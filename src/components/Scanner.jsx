import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Badge, Toggle, Card, Alert, cn } from './ui';
import { api } from '../utils/api';

// ── Constants ─────────────────────────────────────────────────────
const SCAN_MS   = 350;   // fire a scan every 350ms (non-blocking pipeline)
const LERP      = 0.25;  // interpolation factor for smooth box movement (0=frozen,1=instant)
const FADE_MS   = 2000;  // fade unknown boxes after 2s of not being seen

// ── Motion detector ───────────────────────────────────────────────
function motionScore(prev, curr) {
  if (!prev || !curr || prev.length !== curr.length) return 1;
  let d = 0;
  const n = Math.min(prev.length, 3072); // 64×48 pixels
  for (let i = 0; i < n; i++) d += Math.abs(prev[i] - curr[i]);
  return d / n / 255;
}

// ── Lerp box positions ────────────────────────────────────────────
function lerpBox(from, to, t) {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
    from[3] + (to[3] - from[3]) * t,
  ];
}

export default function Scanner() {
  const webcamRef   = useRef(null);
  const canvasRef   = useRef(null);
  const rafRef      = useRef(null);
  const prevPxRef   = useRef(null);
  const scanningRef = useRef(false);   // prevents overlapping scans
  const fpsRef      = useRef({ n: 0, t: Date.now() });

  // "displayed" boxes lerped toward "target" boxes every rAF tick
  const displayedBoxes = useRef([]);  // [{bbox, name, confidence, color, opacity, lastSeen}]
  const targetBoxes    = useRef([]);  // latest result from server

  const [mode,       setMode]       = useState('entry');
  const [paused,     setPaused]     = useState(false);
  const [facing,     setFacing]     = useState('user');
  const [log,        setLog]        = useState([]);
  const [fps,        setFps]        = useState(0);
  const [active,     setActive]     = useState(false);
  const [motion,     setMotion]     = useState(1);
  const [liveChips,  setLiveChips]  = useState([]);

  // ── Canvas renderer (runs at 60fps via rAF) ───────────────────
  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);

    const canvas = canvasRef.current;
    const video  = webcamRef.current?.video;
    if (!canvas || !video) return;

    const cW = canvas.parentElement?.clientWidth  || 640;
    const cH = canvas.parentElement?.clientHeight || 480;
    if (canvas.width !== cW || canvas.height !== cH) {
      canvas.width  = cW;
      canvas.height = cH;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);

    // Compute coordinate mapping (object-fit: contain offsets)
    const vidW  = video.videoWidth  || 320;
    const vidH  = video.videoHeight || 240;
    const scale = Math.min(cW / vidW, cH / vidH);
    const offX  = (cW - vidW * scale) / 2;
    const offY  = (cH - vidH * scale) / 2;

    const now = Date.now();

    // Merge targets into displayed boxes (lerp existing, add new, fade missing)
    const targets = targetBoxes.current;

    // For each target, find matching displayed box (by proximity of centre)
    targets.forEach(t => {
      const tc = [(t.bbox[0]+t.bbox[2])/2, (t.bbox[1]+t.bbox[3])/2];
      let best = null, bestDist = 999999;
      displayedBoxes.current.forEach((d, i) => {
        const dc = [(d.bbox[0]+d.bbox[2])/2, (d.bbox[1]+d.bbox[3])/2];
        const dist = Math.hypot(tc[0]-dc[0], tc[1]-dc[1]);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });

      if (best !== null && bestDist < 120) {
        // Lerp toward new position
        displayedBoxes.current[best].bbox = lerpBox(
          displayedBoxes.current[best].bbox, t.bbox, LERP
        );
        displayedBoxes.current[best].name       = t.name;
        displayedBoxes.current[best].confidence = t.confidence;
        displayedBoxes.current[best].color      = t.color;
        displayedBoxes.current[best].lastSeen   = now;
        displayedBoxes.current[best].opacity    = 1;
      } else {
        // New face — snap to position
        displayedBoxes.current.push({
          bbox:       [...t.bbox],
          name:       t.name,
          confidence: t.confidence,
          color:      t.color,
          lastSeen:   now,
          opacity:    1,
        });
      }
    });

    // Fade out boxes not in targets
    displayedBoxes.current = displayedBoxes.current
      .map(d => {
        const age = now - d.lastSeen;
        return { ...d, opacity: age > FADE_MS ? 0 : 1 - (age / FADE_MS) * 0.5 };
      })
      .filter(d => d.opacity > 0.05);

    // Draw all displayed boxes
    displayedBoxes.current.forEach(d => {
      ctx.globalAlpha = d.opacity;
      const [x1, y1, x2, y2] = d.bbox;
      const rx1 = offX + x1 * scale;
      const ry1 = offY + y1 * scale;
      const rw  = (x2 - x1) * scale;
      const rh  = (y2 - y1) * scale;
      const col = d.color;

      // Box
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2;
      ctx.strokeRect(rx1, ry1, rw, rh);

      // Corner accents
      const cs = Math.min(12, rw * 0.15);
      ctx.lineWidth = 3;
      [
        [rx1, ry1, cs, 0, 0, cs],
        [rx1+rw, ry1, -cs, 0, 0, cs],
        [rx1, ry1+rh, cs, 0, 0, -cs],
        [rx1+rw, ry1+rh, -cs, 0, 0, -cs],
      ].forEach(([x, y, dx1, dy1, dx2, dy2]) => {
        ctx.beginPath();
        ctx.moveTo(x + dx1, y + dy1);
        ctx.lineTo(x, y);
        ctx.lineTo(x + dx2, y + dy2);
        ctx.strokeStyle = col;
        ctx.stroke();
      });

      // Label
      ctx.font      = 'bold 11px Inter, system-ui, sans-serif';
      const label   = d.name === 'Unknown' ? `? ${d.confidence}%` : `${d.name}  ${d.confidence}%`;
      const tw      = ctx.measureText(label).width;
      const lh      = 20;
      ctx.fillStyle = col + 'e0';
      ctx.fillRect(rx1, ry1 - lh, tw + 10, lh);
      ctx.globalAlpha = d.opacity;
      ctx.fillStyle = '#fff';
      ctx.fillText(label, rx1 + 5, ry1 - 5);

      ctx.globalAlpha = 1;
    });
  }, []);

  // Start render loop on mount
  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  // ── Scan pipeline (non-blocking) ──────────────────────────────
  const scan = useCallback(async () => {
    if (paused || scanningRef.current || !webcamRef.current) return;
    scanningRef.current = true;

    const src = webcamRef.current.getScreenshot({ width: 320, height: 240 });
    if (!src) { scanningRef.current = false; return; }

    // Client-side motion check
    try {
      const tmp = document.createElement('canvas');
      tmp.width = 64; tmp.height = 48;
      const tc  = tmp.getContext('2d');
      const img = new Image();
      img.src   = src;
      await new Promise(r => { img.onload = r; });
      tc.drawImage(img, 0, 0, 64, 48);
      const px = tc.getImageData(0, 0, 64, 48).data;
      setMotion(motionScore(prevPxRef.current, px));
      prevPxRef.current = px;
    } catch {}

    try {
      const blob = await (await fetch(src)).blob();
      const form = new FormData();
      form.append('image', blob, 'f.jpg');
      form.append('event_type', mode);

      const res  = await api.scan(form);
      const dets = res.detections || [];

      setActive(true);
      setLiveChips(dets);

      // Update target boxes (renderer will lerp toward these)
      targetBoxes.current = dets
        .filter(d => d.bbox)
        .map(d => ({
          bbox:       d.bbox,
          name:       d.name,
          confidence: d.confidence,
          color:      d.reason === 'spoof'   ? '#eab308'
                    : d.name  !== 'Unknown'  ? '#22c55e'
                    :                          '#ef4444',
        }));

      // Log marked events
      const marked = dets.filter(d => d.logged);
      if (marked.length) {
        const ts = new Date().toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        setLog(p => [
          ...marked.map(d => ({ ...d, ts })),
          ...p,
        ].slice(0, 50));
      }

      // FPS counter
      fpsRef.current.n++;
      const now = Date.now();
      if (now - fpsRef.current.t >= 3000) {
        setFps(Math.round(
          fpsRef.current.n / ((now - fpsRef.current.t) / 1000)
        ));
        fpsRef.current = { n: 0, t: now };
      }
    } catch {}

    scanningRef.current = false;
  }, [paused, mode]);

  useEffect(() => {
    const t = setInterval(scan, SCAN_MS);
    return () => clearInterval(t);
  }, [scan]);

  // When paused, clear target boxes so they fade
  useEffect(() => {
    if (paused) targetBoxes.current = [];
  }, [paused]);

  const motionOk  = motion > 0.008;
  const motionLow = motion > 0.003 && !motionOk;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Live Scanner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pipeline detection · {fps > 0 ? `${fps} fps server` : 'warming up…'} · 60fps render
        </p>
      </div>

      {!motionOk && !motionLow && active && (
        <Alert variant="warning">
          <span>⚠</span>
          <div>
            <p className="font-medium text-sm">Static image detected</p>
            <p className="text-xs mt-0.5 opacity-80">No movement in frame — photo spoofing suspected.</p>
          </div>
        </Alert>
      )}

      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground flex-shrink-0">Mode</span>
        <Toggle
          value={mode}
          onChange={setMode}
          options={[
            { value: 'entry', label: '→ Entry' },
            { value: 'exit',  label: '← Exit'  },
          ]}
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`dot ${motionOk ? 'dot-green' : motionLow ? 'dot-yellow' : 'dot-red'} ${active && !paused && motionOk ? 'dot-pulse' : ''}`} />
          <span>{motionOk ? 'Live' : motionLow ? 'Low motion' : 'Static'}</span>
        </div>
      </div>

      {/* Camera + 60fps canvas overlay */}
      <div className="camera-wrapper" style={{ aspectRatio: '4/3' }}>
        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ width: 640, height: 480, facingMode: facing }}
          mirrored={facing === 'user'}
          className="cam-contain"
        />
        {/* Canvas sits on top — renders at 60fps */}
        <canvas
          ref={canvasRef}
          className="bbox-layer"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
        {active && !paused && motionOk && <div className="scan-line" />}
        {/* Motion bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border">
          <div
            className={cn('h-full transition-colors', motionOk ? 'bg-green-500' : motionLow ? 'bg-yellow-500' : 'bg-red-500')}
            style={{ width: `${Math.min(100, motion * 6000)}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button
          variant={paused ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPaused(p => !p)}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}>
          ⟳ Flip
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setLog([]); setLiveChips([]); targetBoxes.current = []; displayedBoxes.current = []; }}>
          Clear
        </Button>
      </div>

      {/* Live detection chips */}
      {liveChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {liveChips.map((d, i) => {
            const isSpoof = d.reason === 'spoof';
            const isKnown = !isSpoof && d.name !== 'Unknown';
            return (
              <div key={i} className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-xs font-medium',
                isSpoof ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                : isKnown ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              )}>
                <span>{isSpoof ? '⚠' : isKnown ? '✓' : '?'}</span>
                {d.name} · {d.confidence}%
                {d.reason?.startsWith('cooldown') && (
                  <span className="opacity-60 text-[10px]">({d.reason})</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Event log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Attendance Events</h2>
          <Badge variant={mode === 'entry' ? 'green' : 'yellow'}>
            {mode === 'entry' ? '→ Entry mode' : '← Exit mode'}
          </Badge>
        </div>

        {log.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No events logged yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Recognised faces will appear here in real time</p>
          </div>
        ) : (
          <Card>
            {log.slice(0, 20).map((d, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors animate-slide',
                  i < log.length - 1 ? 'border-b border-border' : ''
                )}
              >
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  d.name !== 'Unknown'
                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {d.name !== 'Unknown' ? d.name[0].toUpperCase() : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[d.student_id, d.department].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge variant={d.event_type === 'entry' ? 'green' : 'yellow'}>
                    {d.event_type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{d.ts}</span>
                  <span className="text-[10px] text-muted-foreground">{d.confidence}%</span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
