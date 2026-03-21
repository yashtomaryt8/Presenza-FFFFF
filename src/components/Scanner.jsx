import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Badge, Toggle, Card, cn } from './ui';
import { api } from '../utils/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const SCAN_MS  = 300;   // fire a scan every 300ms
const LERP     = 0.10;  // smooth interpolation (low = very smooth, 0.10 works well at 1fps server)
const FADE_MS  = 1800;  // fade boxes after 1.8s of not being seen

// ── Lerp helpers ──────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function lerpBox(from, to, t) {
  return [
    lerp(from[0], to[0], t),
    lerp(from[1], to[1], t),
    lerp(from[2], to[2], t),
    lerp(from[3], to[3], t),
  ];
}

// Mirror a bbox horizontally within a given width
function mirrorBox(bbox, width) {
  const [x1, y1, x2, y2] = bbox;
  return [width - x2, y1, width - x1, y2];
}

// Euclidean distance between box centres
function boxDist(a, b) {
  const ca = [(a[0] + a[2]) / 2, (a[1] + a[3]) / 2];
  const cb = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
}

// ── Corner accent drawing ─────────────────────────────────────────────────────
function drawCorners(ctx, x, y, w, h, color, size = 14) {
  const s = Math.min(size, w * 0.2, h * 0.2);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = 'round';
  [
    [x,     y,     s,  0,  0,  s],
    [x + w, y,    -s,  0,  0,  s],
    [x,     y + h, s,  0,  0, -s],
    [x + w, y + h, -s, 0,  0, -s],
  ].forEach(([ox, oy, dx1, dy1, dx2, dy2]) => {
    ctx.beginPath();
    ctx.moveTo(ox + dx1, oy + dy1);
    ctx.lineTo(ox, oy);
    ctx.lineTo(ox + dx2, oy + dy2);
    ctx.stroke();
  });
}

// ── Scanner component ─────────────────────────────────────────────────────────
export default function Scanner() {
  const webcamRef  = useRef(null);
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  const scanningRef = useRef(false);
  const facingRef  = useRef('user');  // kept in sync with state, used in render loop
  const fpsRef     = useRef({ n: 0, t: Date.now() });

  // Box state lives in refs (updated every rAF, no re-renders needed)
  const displayedBoxes = useRef([]);  // smoothly interpolated display state
  const targetBoxes    = useRef([]);  // latest server result

  const [mode,      setMode]      = useState('entry');
  const [paused,    setPaused]    = useState(false);
  const [facing,    setFacing]    = useState('user');
  const [log,       setLog]       = useState([]);
  const [fps,       setFps]       = useState(0);
  const [active,    setActive]    = useState(false);
  const [liveChips, setLiveChips] = useState([]);

  // Keep facingRef in sync so the render loop can use it without stale closure
  useEffect(() => { facingRef.current = facing; }, [facing]);

  // ── 60fps Canvas render loop ──────────────────────────────────────────────
  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);

    const canvas = canvasRef.current;
    const video  = webcamRef.current?.video;
    if (!canvas || !video || !video.videoWidth) return;

    // Resize canvas to match container
    const cW = canvas.parentElement?.clientWidth  || 640;
    const cH = canvas.parentElement?.clientHeight || 480;
    if (canvas.width !== cW || canvas.height !== cH) {
      canvas.width  = cW;
      canvas.height = cH;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);

    const vidW = video.videoWidth;
    const vidH = video.videoHeight;

    // object-fit: contain — compute actual rendered dimensions + offset
    const scale = Math.min(cW / vidW, cH / vidH);
    const rW    = vidW * scale;
    const rH    = vidH * scale;
    const offX  = (cW - rW) / 2;
    const offY  = (cH - rH) / 2;

    const now = Date.now();
    const targets = targetBoxes.current;

    // Merge server targets into displayed boxes with lerp
    targets.forEach(t => {
      let bestIdx  = -1;
      let bestDist = Infinity;

      displayedBoxes.current.forEach((d, i) => {
        const dist = boxDist(t.bbox, d.bbox);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      });

      // Match threshold: 15% of rendered width
      const matchThreshold = rW * 0.15;

      if (bestIdx !== -1 && bestDist < matchThreshold) {
        const d = displayedBoxes.current[bestIdx];
        d.bbox       = lerpBox(d.bbox, t.bbox, LERP);
        d.name       = t.name;
        d.confidence = t.confidence;
        d.color      = t.color;
        d.reason     = t.reason;
        d.lastSeen   = now;
        d.opacity    = 1;
      } else {
        displayedBoxes.current.push({
          bbox:       [...t.bbox],
          name:       t.name,
          confidence: t.confidence,
          color:      t.color,
          reason:     t.reason,
          lastSeen:   now,
          opacity:    1,
        });
      }
    });

    // Fade boxes not seen recently
    displayedBoxes.current = displayedBoxes.current
      .map(d => {
        const age = now - d.lastSeen;
        return { ...d, opacity: age > FADE_MS ? 0 : 1 - (age / FADE_MS) * 0.6 };
      })
      .filter(d => d.opacity > 0.05);

    // Draw all boxes
    displayedBoxes.current.forEach(d => {
      ctx.save();
      ctx.globalAlpha = d.opacity;

      // ── Coordinate transform ──────────────────────────────────
      // Server bbox is in the same space as the image sent (max_dim 480 or native)
      // We need to map to the rendered canvas area accounting for:
      //   1. Scale from detection image size → rendered video size
      //   2. object-fit:contain offset
      //   3. Mirror if front camera (CSS mirrors video but NOT our canvas)
      let [bx1, by1, bx2, by2] = d.bbox;

      // Scale bbox from detection image coords to rendered video coords
      // The HF Space receives a resized image (max 480px) so we need to know
      // the ratio between the actual video frame and what was sent.
      // We send at max_dim=480 — compute scale relative to original video.
      const sent_dim   = Math.min(480, Math.max(vidW, vidH));
      const sent_scale = sent_dim / Math.max(vidW, vidH);
      const sent_w     = Math.round(vidW * sent_scale);
      const sent_h     = Math.round(vidH * sent_scale);

      // Map from detection space → video space
      const dx1 = bx1 / sent_w * vidW;
      const dy1 = by1 / sent_h * vidH;
      const dx2 = bx2 / sent_w * vidW;
      const dy2 = by2 / sent_h * vidH;

      // Map from video space → canvas space (object-fit:contain)
      let rx1 = offX + dx1 * scale;
      let ry1 = offY + dy1 * scale;
      let rx2 = offX + dx2 * scale;
      let ry2 = offY + dy2 * scale;

      // Mirror X for front camera (CSS flips video, canvas is unflipped)
      if (facingRef.current === 'user') {
        const tmp = cW - rx2;
        rx2       = cW - rx1;
        rx1       = tmp;
      }

      const rw = rx2 - rx1;
      const rh = ry2 - ry1;
      const col = d.color;

      // Box rect (semi-transparent fill for depth)
      ctx.fillStyle = col + '15';
      ctx.fillRect(rx1, ry1, rw, rh);

      // Box stroke
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(rx1, ry1, rw, rh);

      // Corner accents
      drawCorners(ctx, rx1, ry1, rw, rh, col);

      // Label pill
      const isSpoof   = d.reason === 'spoof';
      const isUnknown = d.name === 'Unknown' || d.name === 'SPOOF';
      const label     = isSpoof
        ? `⚠ Spoof`
        : isUnknown
          ? `? ${d.confidence}%`
          : `${d.name}  ${d.confidence}%`;

      ctx.font         = 'bold 11px Inter, system-ui, sans-serif';
      const textWidth  = ctx.measureText(label).width;
      const pillH      = 22;
      const pillPad    = 8;
      const pillX      = rx1;
      const pillY      = ry1 - pillH - 2;
      const pillW      = textWidth + pillPad * 2;

      // Pill background
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect?.(pillX, pillY, pillW, pillH, 4) ||
        ctx.rect(pillX, pillY, pillW, pillH);
      ctx.fill();

      // Pill text
      ctx.fillStyle   = '#fff';
      ctx.globalAlpha = d.opacity;
      ctx.fillText(label, pillX + pillPad, pillY + pillH - 6);

      ctx.restore();
    });
  }, []);

  // Start render loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  // ── Scan pipeline ─────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    if (paused || scanningRef.current || !webcamRef.current) return;
    scanningRef.current = true;

    // Send at 480×360 — good quality without being too slow to upload
    const src = webcamRef.current.getScreenshot({ width: 480, height: 360 });
    if (!src) { scanningRef.current = false; return; }

    try {
      const blob = await (await fetch(src)).blob();
      const form = new FormData();
      form.append('image', blob, 'frame.jpg');
      form.append('event_type', mode);

      const res  = await api.scan(form);
      const dets = res.detections || [];

      setActive(true);
      setLiveChips(dets);

      // Build target boxes for the render loop
      targetBoxes.current = dets
        .filter(d => d.bbox)
        .map(d => ({
          bbox:       d.bbox,
          name:       d.name,
          confidence: d.confidence,
          reason:     d.reason,
          color:      d.reason === 'spoof'   ? '#f59e0b'
                    : d.reason === 'poor_angle' || d.reason === 'blurry' ? '#6b7280'
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
        setFps(Math.round(fpsRef.current.n / ((now - fpsRef.current.t) / 1000)));
        fpsRef.current = { n: 0, t: now };
      }
    } catch (e) {
      console.warn('Scan error:', e);
    }

    scanningRef.current = false;
  }, [paused, mode]);

  useEffect(() => {
    const t = setInterval(scan, SCAN_MS);
    return () => clearInterval(t);
  }, [scan]);

  useEffect(() => {
    if (paused) targetBoxes.current = [];
  }, [paused]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Live Scanner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {fps > 0 ? `${fps} fps` : 'warming up…'} · 60fps render · buffalo_l
        </p>
      </div>

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
          <span className={`dot ${active && !paused ? 'dot-green dot-pulse' : 'dot-gray'}`} />
          <span>{active && !paused ? 'Live' : paused ? 'Paused' : 'Connecting…'}</span>
        </div>
      </div>

      {/* Camera + canvas overlay */}
      <div className="camera-wrapper" style={{ aspectRatio: '4/3', position: 'relative', overflow: 'hidden', borderRadius: '12px', background: '#000' }}>
        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ width: 640, height: 480, facingMode: facing }}
          mirrored={facing === 'user'}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
        />
        {active && !paused && <div className="scan-line" />}
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
        <Button variant="outline" size="sm" onClick={() => {
          setFacing(f => f === 'user' ? 'environment' : 'user');
          displayedBoxes.current = [];
          targetBoxes.current    = [];
        }}>
          ⟳ Flip
        </Button>
        <Button variant="outline" size="sm" onClick={() => {
          setLog([]);
          setLiveChips([]);
          targetBoxes.current    = [];
          displayedBoxes.current = [];
        }}>
          Clear
        </Button>
      </div>

      {/* Live detection chips */}
      {liveChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {liveChips.map((d, i) => {
            const isSpoof = d.reason === 'spoof';
            const isQuality = d.reason === 'poor_angle' || d.reason === 'blurry';
            const isKnown = !isSpoof && !isQuality && d.name !== 'Unknown';
            return (
              <div key={i} className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-xs font-medium',
                isSpoof
                  ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                  : isQuality
                    ? 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
                  : isKnown
                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              )}>
                <span>{isSpoof ? '⚠' : isQuality ? '~' : isKnown ? '✓' : '?'}</span>
                {isSpoof ? 'Spoof detected' : isQuality ? `${d.name} (${d.reason})` : `${d.name} · ${d.confidence}%`}
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
