import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Badge, Toggle, Card, cn } from './ui';
import { api } from '../utils/api';

// ── Timing constants ──────────────────────────────────────────────────────────
const SCAN_MS   = 250;   // attempt a scan every 250ms (pipelined — won't overlap)
const LERP      = 0.18;  // bbox interpolation factor per rAF tick (~60fps)
const FADE_MS   = 1600;  // fade dead boxes over this ms

// ── Confidence display calibration ───────────────────────────────────────────
// buffalo_l ArcFace raw cosine for same-person in live conditions: ~0.28–0.56
// We map [LO, HI] → [0%, 100%]. Values above HI are capped at 100%.
const CONF_LO   = 0.28;
const CONF_HI   = 0.56;
const MATCH_THR = 0.35; // raw cosine threshold — below = Unknown

// Screenshot dimensions sent to HF Space (fixed — transform math depends on these)
const SHOT_W = 480;
const SHOT_H = 360;

// ── Pure-JS face matching helpers ────────────────────────────────────────────
// These run in the browser after we download user centroids from Railway once.
// 512-dim cosine similarity for 20 users takes ~0.5ms — negligible.

function simToDisplayPct(sim) {
  return Math.round(Math.min(100, Math.max(0, (sim - CONF_LO) / (CONF_HI - CONF_LO) * 100)) * 10) / 10;
}

function cosineSim(a, b) {
  // b is a pre-normalised Float32Array centroid (|b| = 1)
  // a is the raw embedding from HF Space
  let dot = 0, ss = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ss  += a[i] * a[i];
  }
  const norm = Math.sqrt(ss);
  return norm < 1e-9 ? 0 : dot / norm;
}

function matchEmbedding(embedding, users) {
  // Returns { user, sim, displayPct } or null
  let best = null, bestSim = 0;
  for (const u of users) {
    const sim = cosineSim(embedding, u.centroid);
    if (sim > bestSim) { bestSim = sim; best = u; }
  }
  if (bestSim >= MATCH_THR && best) {
    return { user: best, sim: bestSim, displayPct: simToDisplayPct(bestSim) };
  }
  return null;
}

// ── Bbox helpers ──────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function lerpBox(from, to, t) {
  return [lerp(from[0],to[0],t), lerp(from[1],to[1],t),
          lerp(from[2],to[2],t), lerp(from[3],to[3],t)];
}

function drawCorners(ctx, x, y, w, h, color, size = 14) {
  const s = Math.min(size, w * 0.2, h * 0.2);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = 'round';
  [[x,y,s,0,0,s],[x+w,y,-s,0,0,s],[x,y+h,s,0,0,-s],[x+w,y+h,-s,0,0,-s]]
    .forEach(([ox,oy,dx1,dy1,dx2,dy2]) => {
      ctx.beginPath();
      ctx.moveTo(ox+dx1, oy+dy1);
      ctx.lineTo(ox, oy);
      ctx.lineTo(ox+dx2, oy+dy2);
      ctx.stroke();
    });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Scanner() {
  const webcamRef   = useRef(null);
  const canvasRef   = useRef(null);
  const rafRef      = useRef(null);
  const scanningRef = useRef(false);
  const fpsRef      = useRef({ n: 0, t: Date.now() });

  // These refs are read by the 60fps render loop — avoid stale closures
  const displayedBoxes = useRef([]);  // interpolated display state
  const targetBoxes    = useRef([]);  // latest result, written by scan()
  const hfUrlRef       = useRef('');  // HF Space base URL (loaded on mount)
  const userDbRef      = useRef([]);  // [{id,name,student_id,dept,centroid:Float32Array}]
  const cooldownRef    = useRef({});  // {userId_eventType: lastLogMs}

  const [hfUrl,     setHfUrl]     = useState('');
  const [userDb,    setUserDb]    = useState([]);
  const [mode,      setMode]      = useState('entry');
  const [paused,    setPaused]    = useState(false);
  const [facing,    setFacing]    = useState('user');
  const [log,       setLog]       = useState([]);
  const [fps,       setFps]       = useState(0);
  const [active,    setActive]    = useState(false);
  const [liveChips, setLiveChips] = useState([]);
  const [loading,   setLoading]   = useState(true); // true until HF URL + embeddings ready

  // Keep refs in sync with state so the render/scan loops are never stale
  useEffect(() => { hfUrlRef.current  = hfUrl;  }, [hfUrl]);
  useEffect(() => { userDbRef.current = userDb; }, [userDb]);

  // ── Client-side cooldown ──────────────────────────────────────────────────
  function isOnCooldown(userId, eventType, ms = 10_000) {
    return Date.now() - (cooldownRef.current[`${userId}_${eventType}`] || 0) < ms;
  }
  function setCooldown(userId, eventType) {
    cooldownRef.current[`${userId}_${eventType}`] = Date.now();
  }

  // ── Load HF URL + user embeddings on mount ────────────────────────────────
  const refreshEmbeddings = useCallback(async () => {
    try {
      const data = await api.userEmbeddings();
      const db = (data.users || []).map(u => ({
        ...u,
        // Float32Array for fast typed-array dot product in JS
        centroid: new Float32Array(u.centroid),
      }));
      setUserDb(db);
    } catch (e) {
      console.warn('Could not load user embeddings:', e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const health = await api.health();
        if (!mounted) return;
        const url = (health.hf_space || '').replace(/\/$/, '');
        setHfUrl(url);
        // Warm up the HF Space so it isn't cold when the user hits scan
        if (url) fetch(`${url}/health`).catch(() => {});
      } catch {}
      await refreshEmbeddings();
      if (mounted) setLoading(false);
    })();

    // Refresh embeddings every 60s so new registrations appear without reload
    const t = setInterval(refreshEmbeddings, 60_000);
    return () => { mounted = false; clearInterval(t); };
  }, [refreshEmbeddings]);

  // ── 60fps canvas render loop ──────────────────────────────────────────────
  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);

    const canvas = canvasRef.current;
    const video  = webcamRef.current?.video;
    if (!canvas || !video || !video.videoWidth) return;

    // Match canvas pixel size to its CSS display size
    const cW = canvas.parentElement?.clientWidth  || 640;
    const cH = canvas.parentElement?.clientHeight || 480;
    if (canvas.width !== cW || canvas.height !== cH) {
      canvas.width  = cW;
      canvas.height = cH;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);

    // ── Coordinate transform ──────────────────────────────────────────────
    // react-webcam's getScreenshot() with mirrored=true ALREADY mirrors the
    // image before encoding it (applies ctx.scale(-1,1) internally). So the
    // server receives a mirrored frame and returns bbox coords in that mirrored
    // space — which is exactly the same orientation the user sees. No further
    // flip is needed on the canvas. Any flip here causes a double-mirror = box
    // on the wrong side of the face (the bug you saw).
    //
    // Screenshot is always SHOT_W × SHOT_H (480×360). Container is 4:3.
    // Transform: canvas_x = bbox_x * (cW / SHOT_W), same for Y.
    //
    const scaleX = cW / SHOT_W;
    const scaleY = cH / SHOT_H;

    const now     = Date.now();
    const targets = targetBoxes.current;

    // Merge server targets → displayed boxes using lerp
    targets.forEach(t => {
      let bestIdx = -1, bestDist = Infinity;
      displayedBoxes.current.forEach((d, i) => {
        // Compare in canvas space for consistent thresholding
        const ct = [((t.bbox[0]+t.bbox[2])/2)*scaleX, ((t.bbox[1]+t.bbox[3])/2)*scaleY];
        const cd = [((d.bbox[0]+d.bbox[2])/2)*scaleX, ((d.bbox[1]+d.bbox[3])/2)*scaleY];
        const dist = Math.hypot(ct[0]-cd[0], ct[1]-cd[1]);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      });

      if (bestIdx !== -1 && bestDist < cW * 0.15) {
        // Lerp toward new target position
        const d = displayedBoxes.current[bestIdx];
        d.bbox       = lerpBox(d.bbox, t.bbox, LERP);
        d.name       = t.name;
        d.confidence = t.confidence;
        d.color      = t.color;
        d.reason     = t.reason;
        d.lastSeen   = now;
        d.opacity    = 1;
      } else {
        // New face — snap into position
        displayedBoxes.current.push({ ...t, bbox: [...t.bbox], lastSeen: now, opacity: 1 });
      }
    });

    // Fade boxes that haven't had a detection recently
    displayedBoxes.current = displayedBoxes.current
      .map(d => {
        const age = now - d.lastSeen;
        return { ...d, opacity: age > FADE_MS ? 0 : 1 - (age / FADE_MS) * 0.65 };
      })
      .filter(d => d.opacity > 0.05);

    // Draw all live boxes
    displayedBoxes.current.forEach(d => {
      ctx.save();
      ctx.globalAlpha = d.opacity;

      const [bx1, by1, bx2, by2] = d.bbox;
      // Map from screenshot space → canvas space
      const rx1 = bx1 * scaleX;
      const ry1 = by1 * scaleY;
      const rw  = (bx2 - bx1) * scaleX;
      const rh  = (by2 - by1) * scaleY;
      const col = d.color;

      // Semi-transparent fill
      ctx.fillStyle = col + '18';
      ctx.fillRect(rx1, ry1, rw, rh);

      // Box outline
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(rx1, ry1, rw, rh);

      // Corner accents
      drawCorners(ctx, rx1, ry1, rw, rh, col);

      // Label pill
      const isSpoof   = d.reason === 'spoof';
      const isUnknown = d.name === 'Unknown';
      const label = isSpoof ? '⚠ Spoof'
                  : isUnknown ? `? ${d.confidence}%`
                  : `${d.name}  ${d.confidence}%`;

      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      const tw  = ctx.measureText(label).width;
      const ph  = 22, pp = 8;
      const px  = rx1;
      const py  = ry1 - ph - 2;
      const pw  = tw + pp * 2;

      ctx.fillStyle = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 4);
      else ctx.rect(px, py, pw, ph);
      ctx.fill();

      ctx.fillStyle   = '#fff';
      ctx.globalAlpha = d.opacity;
      ctx.fillText(label, px + pp, py + ph - 6);
      ctx.restore();
    });
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  // ── Scan pipeline — NEW ARCHITECTURE ─────────────────────────────────────
  // OLD: Frontend → Railway → HF Space → Railway → Frontend  (~470–900ms)
  // NEW: Frontend → HF Space directly → Frontend  (~180–350ms)
  //       └─ fire-and-forget: Frontend → Railway /log/ (async, doesn't block)
  //
  // This removes one full network round-trip and the Railway processing overhead.
  const scan = useCallback(async () => {
    if (paused || scanningRef.current || !hfUrlRef.current || !webcamRef.current) return;
    scanningRef.current = true;

    // react-webcam mirrors this screenshot internally when mirrored=true
    const src = webcamRef.current.getScreenshot({ width: SHOT_W, height: SHOT_H });
    if (!src) { scanningRef.current = false; return; }

    try {
      const blob = await (await fetch(src)).blob();
      const form = new FormData();
      form.append('image', blob, 'frame.jpg');

      // ── Call HF Space directly — one network hop ──────────────────────
      const res = await fetch(`${hfUrlRef.current}/detect`, {
        method: 'POST',
        body:   form,
      });
      if (!res.ok) { scanningRef.current = false; return; }
      const { faces = [] } = await res.json();

      setActive(true);
      const newTargets = [];
      const newChips   = [];

      for (const face of faces) {
        if (!face.embedding || !face.bbox) continue;

        // ── Pure JS cosine matching (~0.5ms for 20 users) ──────────────
        const match = matchEmbedding(face.embedding, userDbRef.current);

        if (match) {
          const onCooldown = isOnCooldown(match.user.id, mode);
          newTargets.push({
            bbox:       face.bbox,
            name:       match.user.name,
            confidence: match.displayPct,
            reason:     onCooldown ? 'cooldown' : 'matched',
            color:      '#22c55e',
          });
          newChips.push({
            name:       match.user.name,
            student_id: match.user.student_id,
            department: match.user.department,
            confidence: match.displayPct,
            reason:     onCooldown ? `cooldown` : 'matched',
            logged:     !onCooldown,
            event_type: mode,
          });

          if (!onCooldown) {
            setCooldown(match.user.id, mode);

            // ── Fire-and-forget attendance log to Railway ──────────────
            // Does NOT await — this runs in background and never blocks
            // the bbox update or next scan cycle.
            api.logAttendance(match.user.id, mode, match.sim).catch(() => {});

            // Update local event log immediately (no need to wait for Railway)
            const ts = new Date().toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
            setLog(p => [{
              name:       match.user.name,
              student_id: match.user.student_id,
              department: match.user.department,
              confidence: match.displayPct,
              event_type: mode,
              ts,
            }, ...p].slice(0, 50));
          }
        } else {
          // Unknown face — still show bbox
          newTargets.push({
            bbox:       face.bbox,
            name:       'Unknown',
            confidence: simToDisplayPct(0),
            reason:     'no_match',
            color:      '#ef4444',
          });
          newChips.push({ name: 'Unknown', confidence: 0, reason: 'no_match' });
        }
      }

      targetBoxes.current = newTargets;
      setLiveChips(newChips);

      // FPS counter (server-side requests per second)
      fpsRef.current.n++;
      const now = Date.now();
      if (now - fpsRef.current.t >= 3000) {
        setFps(Math.round(fpsRef.current.n / ((now - fpsRef.current.t) / 1000)));
        fpsRef.current = { n: 0, t: now };
      }
    } catch (e) {
      // Silently skip — HF Space may be briefly restarting
      if (e.name !== 'AbortError') console.warn('Scan error:', e?.message);
    }

    scanningRef.current = false;
  }, [paused, mode]);

  useEffect(() => {
    const t = setInterval(scan, SCAN_MS);
    return () => clearInterval(t);
  }, [scan]);

  useEffect(() => {
    if (paused) { targetBoxes.current = []; }
  }, [paused]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Live Scanner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {loading
            ? 'Connecting to HF Space…'
            : fps > 0
              ? `${fps} fps · direct HF · 60fps render · buffalo_l`
              : 'Warming up…'}
        </p>
      </div>

      {/* Mode toggle + status dot */}
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
          <span className={`dot ${active && !paused ? 'dot-green dot-pulse' : loading ? 'dot-yellow' : 'dot-gray'}`} />
          <span>
            {loading ? 'Loading…' : active && !paused ? `Live · ${userDbRef.current.length} users` : paused ? 'Paused' : 'Ready'}
          </span>
        </div>
      </div>

      {/* Camera + canvas overlay */}
      <div
        className="camera-wrapper"
        style={{ aspectRatio: '4/3', position: 'relative', overflow: 'hidden',
                 borderRadius: '12px', background: '#000' }}
      >
        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ width: 640, height: 480, facingMode: facing }}
          mirrored={facing === 'user'}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                   width: '100%', height: '100%' }}
        />
        {active && !paused && <div className="scan-line" />}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button variant={paused ? 'default' : 'outline'} size="sm"
          onClick={() => setPaused(p => !p)}>
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
          setLog([]); setLiveChips([]);
          targetBoxes.current = []; displayedBoxes.current = [];
        }}>
          Clear
        </Button>
        <Button variant="outline" size="sm" onClick={refreshEmbeddings}
          title="Reload registered users">
          ↻ Sync
        </Button>
      </div>

      {/* Live detection chips */}
      {liveChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {liveChips.map((d, i) => {
            const isSpoof  = d.reason === 'spoof';
            const isKnown  = !isSpoof && d.name !== 'Unknown';
            const onCD     = d.reason === 'cooldown';
            return (
              <div key={i} className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-xs font-medium',
                isSpoof
                  ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                  : isKnown
                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              )}>
                <span>{isSpoof ? '⚠' : isKnown ? '✓' : '?'}</span>
                {d.name} · {d.confidence}%
                {onCD && <span className="opacity-60 text-[10px]">(cooldown)</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Attendance event log */}
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
            <p className="text-xs text-muted-foreground/70 mt-1">
              Recognised faces will appear here in real time
            </p>
          </div>
        ) : (
          <Card>
            {log.slice(0, 20).map((d, i) => (
              <div key={i} className={cn(
                'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors animate-slide',
                i < log.length - 1 ? 'border-b border-border' : ''
              )}>
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                )}>
                  {d.name[0].toUpperCase()}
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
