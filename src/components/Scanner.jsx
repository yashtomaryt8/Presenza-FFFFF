import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Badge, Toggle, Card, cn } from './ui';
import { api } from '../utils/api';

// ─────────────────────────────────────────────────────────────────────────────
// TIMING
// ─────────────────────────────────────────────────────────────────────────────
const SCAN_MS  = 250;   // fire a scan every 250ms (pipelined — guarded by scanningRef)
const LERP     = 0.22;  // per-rAF bbox interpolation (higher = snappier, lower = smoother)
const FADE_MS  = 2500;  // keep a box visible for 2.5s after last successful detection

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE CALIBRATION
// buffalo_l ArcFace same-person cosine on live CPU frames: ~0.28–0.56.
// We map that real range to 0–100% for display, rather than multiply raw × 100
// (which would cap out at 56% for a perfect match — confusing).
// ─────────────────────────────────────────────────────────────────────────────
const CONF_LO   = 0.28;
const CONF_HI   = 0.56;
const MATCH_THR = 0.30; // raw cosine below this → Unknown (lowered from 0.35 — less strict)

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORAL CONFIRMATION — core anti-flicker algorithm
//
// Problem: At 1fps effective server updates, a single frame where the face is
// slightly turned / blurry gives cosine < MATCH_THR. Without smoothing, the
// label instantly flips to "? 0%" for that one frame. The user sees a flash.
//
// Solution: Each tracked slot has two layers:
//   - candidateName / candidateStreak: what the current frames are saying
//   - displayName: what is ACTUALLY SHOWN — only updated after CONFIRM_STREAK
//     consecutive frames agree on the candidate.
//
// CONFIRM_STREAK = 2 means after 2 frames in a row saying "Yash", we show Yash.
// UNKNOWN_STREAK = 4 means after 4 frames in a row saying Unknown, we show Unknown.
// One bad frame can never change the display. Four bad frames reset it slowly.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIRM_STREAK = 2;
const UNKNOWN_STREAK = 4;

// Screenshot dimensions sent to HF Space — all coordinate math depends on these.
const SHOT_W = 480;
const SHOT_H = 360;

// ─────────────────────────────────────────────────────────────────────────────
// PURE-JS FACE MATCHING
// After loading centroids from Railway once, all matching runs in the browser.
// 512-dim dot product over 20 users ≈ 0.5ms — never blocks the UI.
// ─────────────────────────────────────────────────────────────────────────────
function simToDisplayPct(sim) {
  return Math.round(
    Math.min(100, Math.max(0, (sim - CONF_LO) / (CONF_HI - CONF_LO) * 100)) * 10
  ) / 10;
}

function cosineSim(a, b) {
  // b is a pre-normalised Float32Array centroid (|b| = 1, guaranteed by backend).
  // We normalise a inline so no pre-processing is needed on HF embeddings.
  let dot = 0, ss = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ss += a[i] * a[i]; }
  const norm = Math.sqrt(ss);
  return norm < 1e-9 ? 0 : dot / norm;
}

function matchEmbedding(embedding, users) {
  let best = null, bestSim = 0;
  for (const u of users) {
    const sim = cosineSim(embedding, u.centroid);
    if (sim > bestSim) { bestSim = sim; best = u; }
  }
  return bestSim >= MATCH_THR && best
    ? { user: best, sim: bestSim, displayPct: simToDisplayPct(bestSim) }
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// IoU — Intersection over Union
// More robust than centre-distance for matching server detections to slots:
// scale-invariant, handles large faces near the camera correctly.
// Two boxes with IoU > threshold are considered the same face.
// ─────────────────────────────────────────────────────────────────────────────
const IOU_MIN = 0.20; // lower = more permissive matching

function iou(a, b) {
  const ix1 = Math.max(a[0], b[0]), iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]), iy2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  if (!inter) return 0;
  const aA = (a[2]-a[0])*(a[3]-a[1]), bA = (b[2]-b[0])*(b[3]-b[1]);
  return inter / (aA + bA - inter);
}

// ─────────────────────────────────────────────────────────────────────────────
// LERP + DRAWING HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const lerpBox = (f, to, t) => [lerp(f[0],to[0],t),lerp(f[1],to[1],t),lerp(f[2],to[2],t),lerp(f[3],to[3],t)];

function drawCorners(ctx, x, y, w, h, col) {
  const s = Math.min(14, w * 0.2, h * 0.2);
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  [[x,y,s,0,0,s],[x+w,y,-s,0,0,s],[x,y+h,s,0,0,-s],[x+w,y+h,-s,0,0,-s]]
    .forEach(([ox,oy,a,b,c,d]) => {
      ctx.beginPath(); ctx.moveTo(ox+a,oy+b); ctx.lineTo(ox,oy); ctx.lineTo(ox+c,oy+d); ctx.stroke();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT FACTORY
// One slot = one continuously tracked face across frames.
// ─────────────────────────────────────────────────────────────────────────────
let _sid = 0;
function makeSlot(bbox, name, conf, color) {
  return {
    id: ++_sid,
    bbox:             [...bbox],       // display position (lerped by rAF)
    serverBbox:       [...bbox],       // last confirmed server position
    lastSeenMs:       Date.now(),      // for fade-out
    opacity:          1,
    displayName:      name,            // what the user actually sees
    displayConf:      conf,
    displayColor:     color,
    candidateName:    name,            // building up a streak
    candidateConf:    conf,
    candidateStreak:  1,
    unknownStreak:    name === 'Unknown' ? 1 : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCANNER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Scanner() {
  const webcamRef   = useRef(null);
  const canvasRef   = useRef(null);
  const rafRef      = useRef(null);
  const scanningRef = useRef(false);
  const fpsRef      = useRef({ n: 0, t: Date.now() });

  // Mutable tracking state in refs — never causes React re-renders from the
  // 60fps render loop, which would be ~3600 re-renders per minute.
  const slots       = useRef([]);  // active face-tracking slots
  const hfUrlRef    = useRef('');  // HF Space URL, set after health check
  const userDbRef   = useRef([]);  // [{id, name, centroid: Float32Array, ...}]
  const cooldownRef = useRef({});  // {userId_eventType: timestamp}
  const modeRef     = useRef('entry'); // stays in sync with mode state

  const [mode,       setMode]       = useState('entry');
  const [paused,     setPaused]     = useState(false);
  const [facing,     setFacing]     = useState('user');
  const [log,        setLog]        = useState([]);
  const [fps,        setFps]        = useState(0);
  const [active,     setActive]     = useState(false);
  const [liveChips,  setLiveChips]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  // Separate state for user count so React re-renders when embeddings load.
  // We can't use userDbRef.current.length in JSX — refs don't trigger re-renders.
  const [userCount,  setUserCount]  = useState(0);

  // Keep modeRef in sync — scan() reads from ref to avoid stale closures
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ── Client-side cooldown ───────────────────────────────────────────────────
  const isOnCooldown = (uid, evt, ms = 10_000) =>
    Date.now() - (cooldownRef.current[`${uid}_${evt}`] || 0) < ms;
  const setCooldown = (uid, evt) => {
    cooldownRef.current[`${uid}_${evt}`] = Date.now();
  };

  // ── Embedding loader with aggressive retry ─────────────────────────────────
  // BUG IN PREVIOUS VERSION: refreshEmbeddings ran once on mount with no retry.
  // If Railway was cold (takes 10-30s to wake), the single attempt failed silently
  // and the user saw "0 users" + red boxes for up to 60 seconds until the next
  // scheduled refresh. Manually clicking Sync worked because Railway had warmed up.
  //
  // FIX: Retry every 3 seconds until at least one user loads, then switch to
  // the normal 60s refresh interval. This means the scanner becomes functional
  // within ~5s of Railway waking up, without any manual interaction.
  const refreshEmbeddings = useCallback(async () => {
    try {
      const data = await api.userEmbeddings();
      const db   = (data.users || []).map(u => ({
        ...u,
        centroid: new Float32Array(u.centroid),
      }));
      userDbRef.current = db;
      setUserCount(db.length); // trigger re-render for the count display
      return db.length > 0;   // return success signal for retry logic
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let retryTimer = null;

    const init = async () => {
      // Step 1: get HF Space URL from Railway health endpoint.
      // Retry up to 8 times with 3s gap (covers 24s of Railway cold start).
      for (let i = 0; i < 8; i++) {
        try {
          const health = await api.health();
          if (!mounted) return;
          const url = (health.hf_space || '').replace(/\/$/, '');
          hfUrlRef.current = url;
          // Warm up HF Space immediately — it cold-starts after 15min idle
          if (url) fetch(`${url}/health`).catch(() => {});
          break;
        } catch {
          if (!mounted) return;
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // Step 2: load user embeddings.
      const ok = await refreshEmbeddings();
      if (mounted) setLoading(false);

      // Step 3: if no users loaded yet (Railway DB empty or still initialising),
      // keep retrying every 3s so the scanner becomes functional as soon as
      // a user registers without needing a manual Sync click.
      if (!ok && mounted) {
        const scheduleRetry = () => {
          retryTimer = setTimeout(async () => {
            if (!mounted) return;
            const success = await refreshEmbeddings();
            if (!success && mounted) scheduleRetry();
          }, 3000);
        };
        scheduleRetry();
      }
    };

    init();

    // Normal refresh interval — keeps embeddings current as new users register
    const interval = setInterval(refreshEmbeddings, 60_000);

    return () => {
      mounted = false;
      clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [refreshEmbeddings]);

  // ── 60fps Canvas render loop ───────────────────────────────────────────────
  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);

    const canvas = canvasRef.current;
    const video  = webcamRef.current?.video;
    if (!canvas || !video || !video.videoWidth) return;

    const cW = canvas.parentElement?.clientWidth  || 640;
    const cH = canvas.parentElement?.clientHeight || 480;
    if (canvas.width !== cW || canvas.height !== cH) {
      canvas.width = cW; canvas.height = cH;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);

    // ── Letterbox-aware coordinate transform ──────────────────────────────
    //
    // react-webcam mirrors the screenshot internally when mirrored=true, so
    // bbox coords from HF Space are already in the mirrored orientation that
    // matches what the user sees. No additional flip is needed.
    //
    // The tricky part: the video element uses objectFit:contain, which may add
    // letterboxing (black bars) if the camera aspect ratio differs from the
    // container. We must account for those bars when mapping bbox → canvas.
    //
    //   renderScale = min(cW / vidW, cH / vidH)   ← same maths as objectFit:contain
    //   renderW     = vidW * renderScale           ← actual pixel width of video content
    //   offX        = (cW - renderW) / 2          ← horizontal bar width
    //
    // Then: canvas_x = offX + (bbox_x / SHOT_W) * renderW
    //
    // Since getScreenshot captures the full camera frame (no bars), bbox coords
    // are fractions of the camera frame. Multiplying by renderW maps them into
    // the video-content area on screen.
    const vidW = video.videoWidth;
    const vidH = video.videoHeight;
    const rs   = Math.min(cW / vidW, cH / vidH);  // renderScale
    const rW   = vidW * rs;
    const rH   = vidH * rs;
    const offX = (cW - rW) / 2;
    const offY = (cH - rH) / 2;

    // Helpers: bbox-space (SHOT_W × SHOT_H) → canvas pixels
    const bx = (x) => offX + x * (rW / SHOT_W);
    const by = (y) => offY + y * (rH / SHOT_H);

    const now = Date.now();

    // Lerp each slot's display position toward its last known server position.
    // This creates smooth motion between the ~4fps server updates.
    slots.current.forEach(s => {
      s.bbox    = lerpBox(s.bbox, s.serverBbox, LERP);
      const age = now - s.lastSeenMs;
      s.opacity = age > FADE_MS ? 0 : 1 - (age / FADE_MS) * 0.7;
    });
    slots.current = slots.current.filter(s => s.opacity > 0.04);

    // Draw each tracked face slot
    slots.current.forEach(s => {
      ctx.save();
      ctx.globalAlpha = s.opacity;

      const rx1 = bx(s.bbox[0]);
      const ry1 = by(s.bbox[1]);
      const rw  = bx(s.bbox[2]) - rx1;
      const rh  = by(s.bbox[3]) - ry1;
      const col = s.displayColor;

      ctx.fillStyle = col + '18';
      ctx.fillRect(rx1, ry1, rw, rh);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.strokeRect(rx1, ry1, rw, rh);
      drawCorners(ctx, rx1, ry1, rw, rh, col);

      // Label shows CONFIRMED identity — NOT the per-frame instantaneous result.
      // This is what prevents the "1-second blip" flicker.
      const label = s.displayName === 'Unknown'
        ? `? ${s.displayConf}%`
        : `${s.displayName}  ${s.displayConf}%`;

      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const ph = 22, pp = 8;

      ctx.fillStyle = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(rx1, ry1 - ph - 2, tw + pp*2, ph, 4);
      else ctx.rect(rx1, ry1 - ph - 2, tw + pp*2, ph);
      ctx.fill();

      ctx.fillStyle   = '#fff';
      ctx.globalAlpha = s.opacity;
      ctx.fillText(label, rx1 + pp, ry1 - 8);
      ctx.restore();
    });
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  // ── Scan pipeline — direct HF → JS match → fire-and-forget log ────────────
  const scan = useCallback(async () => {
    if (paused || scanningRef.current || !hfUrlRef.current) return;
    scanningRef.current = true;

    const src = webcamRef.current?.getScreenshot({ width: SHOT_W, height: SHOT_H });
    if (!src) { scanningRef.current = false; return; }

    try {
      const blob = await (await fetch(src)).blob();
      const form = new FormData();
      form.append('image', blob, 'frame.jpg');

      // Direct call to HF Space — skips Railway entirely on the hot path.
      // This removes one full network round-trip (~200–400ms).
      const res = await fetch(`${hfUrlRef.current}/detect`, { method: 'POST', body: form });
      if (!res.ok) { scanningRef.current = false; return; }

      const { faces = [] } = await res.json();
      setActive(true);

      const now         = Date.now();
      const currentMode = modeRef.current;
      const matched     = new Set(); // which slots were matched this frame
      const newChips    = [];

      // ── IoU-based slot matching + temporal confirmation ──────────────────
      faces.forEach(face => {
        if (!face.embedding || !face.bbox) return;

        const detBbox = face.bbox;

        // Find which existing slot best matches this detection.
        // IoU is scale-invariant: works correctly whether face is far or close.
        let bestSlotIdx = -1, bestIou = IOU_MIN;
        slots.current.forEach((s, i) => {
          if (matched.has(i)) return;
          const score = iou(detBbox, s.serverBbox);
          if (score > bestIou) { bestIou = score; bestSlotIdx = i; }
        });

        // JS cosine matching (~0.5ms for 20 users)
        const match    = matchEmbedding(face.embedding, userDbRef.current);
        const newName  = match ? match.user.name  : 'Unknown';
        const newConf  = match ? match.displayPct : simToDisplayPct(0);
        const newColor = match ? '#22c55e' : '#ef4444';

        let slot;
        if (bestSlotIdx !== -1) {
          slot = slots.current[bestSlotIdx];
          matched.add(bestSlotIdx);
        } else {
          // New face entered frame — create a fresh slot
          slot = makeSlot(detBbox, newName, newConf, newColor);
          slots.current.push(slot);
        }

        // Update slot position and timing
        slot.serverBbox  = [...detBbox];
        slot.lastSeenMs  = now;
        slot.opacity     = 1;

        // ── Temporal confirmation (anti-flicker) ─────────────────────────
        //
        // Think of this as a vote counter: each frame casts a vote for what
        // it sees. The DISPLAYED result only changes once a candidate has won
        // CONFIRM_STREAK votes in a row. A single outlier frame (blurry frame,
        // slight head-turn) can't change the display by itself.
        //
        if (newName !== 'Unknown') {
          slot.unknownStreak = 0;
          if (newName === slot.candidateName) {
            slot.candidateStreak++;
            slot.candidateConf = newConf; // update confidence each frame
          } else {
            // Different name candidate — restart streak
            slot.candidateName   = newName;
            slot.candidateConf   = newConf;
            slot.candidateStreak = 1;
          }
          if (slot.candidateStreak >= CONFIRM_STREAK) {
            // Enough evidence — commit to this identity
            slot.displayName  = slot.candidateName;
            slot.displayConf  = slot.candidateConf;
            slot.displayColor = newColor;
          }
        } else {
          // This frame says Unknown — only reset display after UNKNOWN_STREAK frames
          slot.unknownStreak++;
          if (slot.unknownStreak >= UNKNOWN_STREAK) {
            slot.displayName  = 'Unknown';
            slot.displayConf  = newConf;
            slot.displayColor = '#ef4444';
            slot.candidateName   = 'Unknown';
            slot.candidateStreak = 0;
          }
          // else: keep showing previous confirmed name (sticky behaviour)
        }

        // Build chip data using confirmed (not instantaneous) identity
        const onCooldown = match ? isOnCooldown(match.user.id, currentMode) : false;
        newChips.push({
          name:       slot.displayName,
          confidence: slot.displayConf,
          reason:     onCooldown ? 'cooldown' : (match ? 'matched' : 'no_match'),
        });

        // Fire-and-forget attendance log — only when identity is confirmed and
        // not on cooldown. We gate on candidateStreak to avoid logging before
        // the temporal confirmation has fired.
        if (match && !onCooldown
            && slot.displayName !== 'Unknown'
            && slot.candidateStreak >= CONFIRM_STREAK) {
          setCooldown(match.user.id, currentMode);
          api.logAttendance(match.user.id, currentMode, match.sim).catch(() => {});

          const ts = new Date().toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          });
          setLog(p => [{
            name:       match.user.name,
            student_id: match.user.student_id,
            department: match.user.department,
            confidence: match.displayPct,
            event_type: currentMode,
            ts,
          }, ...p].slice(0, 50));
        }
      });

      // NOTE: We deliberately do NOT clear slots for faces not detected this
      // frame. The fade-out mechanism in the render loop handles that smoothly
      // over FADE_MS. Clearing immediately caused the "blip" where a single
      // missed HF response made the box flash out and back in.

      setLiveChips(newChips);

      fpsRef.current.n++;
      const nowMs = Date.now();
      if (nowMs - fpsRef.current.t >= 3000) {
        setFps(Math.round(fpsRef.current.n / ((nowMs - fpsRef.current.t) / 1000)));
        fpsRef.current = { n: 0, t: nowMs };
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('Scan:', e?.message);
    }

    scanningRef.current = false;
  }, [paused]); // mode is read from modeRef, so not a dependency here

  useEffect(() => {
    const t = setInterval(scan, SCAN_MS);
    return () => clearInterval(t);
  }, [scan]);

  useEffect(() => {
    if (paused) slots.current.forEach(s => { s.lastSeenMs = 0; });
  }, [paused]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Live Scanner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {loading
            ? 'Connecting…'
            : fps > 0
              ? `${fps} fps · direct HF · 60fps render · buffalo_l`
              : 'Warming up…'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground flex-shrink-0">Mode</span>
        <Toggle value={mode} onChange={setMode}
          options={[{ value: 'entry', label: '→ Entry' }, { value: 'exit', label: '← Exit' }]} />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`dot ${active && !paused ? 'dot-green dot-pulse' : loading ? 'dot-yellow' : 'dot-gray'}`} />
          {/* userCount is a proper state value — updates React when embeddings load */}
          <span>
            {loading
              ? 'Loading…'
              : active && !paused
                ? `Live · ${userCount} user${userCount !== 1 ? 's' : ''}`
                : paused ? 'Paused' : 'Ready'}
          </span>
        </div>
      </div>

      <div className="camera-wrapper"
        style={{ aspectRatio: '4/3', position: 'relative', overflow: 'hidden',
                 borderRadius: '12px', background: '#000' }}>
        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ width: 640, height: 480, facingMode: facing }}
          mirrored={facing === 'user'}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
        <canvas ref={canvasRef}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                   width: '100%', height: '100%' }} />
        {active && !paused && <div className="scan-line" />}
      </div>

      <div className="flex gap-2">
        <Button variant={paused ? 'default' : 'outline'} size="sm"
          onClick={() => setPaused(p => !p)}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => {
          setFacing(f => f === 'user' ? 'environment' : 'user');
          slots.current = [];
        }}>⟳ Flip</Button>
        <Button variant="outline" size="sm" onClick={() => {
          setLog([]); setLiveChips([]); slots.current = [];
        }}>Clear</Button>
        <Button variant="outline" size="sm"
          onClick={() => refreshEmbeddings()}
          title="Reload registered users">↻ Sync</Button>
      </div>

      {liveChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {liveChips.map((d, i) => {
            const isKnown = d.name !== 'Unknown';
            const onCD    = d.reason === 'cooldown';
            return (
              <div key={i} className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-xs font-medium',
                isKnown
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              )}>
                <span>{isKnown ? '✓' : '?'}</span>
                {d.name} · {d.confidence}%
                {onCD && <span className="opacity-60 text-[10px]">(cooldown)</span>}
              </div>
            );
          })}
        </div>
      )}

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
              <div key={i} className={cn(
                'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors animate-slide',
                i < log.length - 1 ? 'border-b border-border' : ''
              )}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                  {d.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[d.student_id, d.department].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge variant={d.event_type === 'entry' ? 'green' : 'yellow'}>{d.event_type}</Badge>
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
