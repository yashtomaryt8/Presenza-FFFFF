import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Card, CardHeader, CardTitle, CardBody, Input, Badge, Alert, Spinner, cn } from './ui';
import { api } from '../utils/api';

const MAX   = 10;
const HINTS = ['Front', 'Look left', 'Look right', 'Tilt up', 'With mask', 'With glasses'];

export default function Register() {
  const wRef  = useRef(null);
  const fRef  = useRef(null);

  const [name,    setName]    = useState('');
  const [sid,     setSid]     = useState('');
  const [dept,    setDept]    = useState('');
  const [photos,  setPhotos]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState(null);   // {type:'ok'|'err'|'dup', text, dupName?}
  const [facing,  setFacing]  = useState('user');
  const [showCam, setShowCam] = useState(true);

  const capture = useCallback(() => {
    if (photos.length >= MAX) return;
    const src = wRef.current?.getScreenshot({ width: 640, height: 480 });
    if (!src) return;
    fetch(src).then(r => r.blob()).then(b =>
      setPhotos(p => [...p, { blob: b, url: src }])
    );
  }, [photos.length]);

  const onFiles = e => {
    const files = Array.from(e.target.files || []).slice(0, MAX - photos.length);
    setPhotos(p => [
      ...p,
      ...files.map(f => ({ blob: f, url: URL.createObjectURL(f) })),
    ].slice(0, MAX));
    e.target.value = '';
  };

  const submit = async () => {
    if (!name.trim())   return setMsg({ type: 'err', text: 'Full name is required.' });
    if (!photos.length) return setMsg({ type: 'err', text: 'Add at least 1 photo.' });

    setLoading(true);
    setMsg(null);

    const form = new FormData();
    form.append('name',       name.trim());
    form.append('student_id', sid.trim());
    form.append('department', dept.trim());
    photos.forEach((p, i) => form.append(`image_${i}`, p.blob, `p${i}.jpg`));

    try {
      const r = await api.register(form);
      setMsg({ type: 'ok', text: r.message });
      setName(''); setSid(''); setDept(''); setPhotos([]);
    } catch (e) {
      // HTTP 409 = duplicate face detected
      if (e.message?.includes('409') || e.status === 409) {
        let detail = e.message;
        try { detail = JSON.parse(e.raw || '{}').error || detail; } catch {}
        setMsg({ type: 'dup', text: detail });
      } else {
        setMsg({ type: 'err', text: e.message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Register Student</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Capture multiple angles for best recognition accuracy
        </p>
      </div>

      {/* Info */}
      <Card>
        <CardHeader><CardTitle>Student Details</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <Input
            label="Full Name *"
            placeholder="e.g. Yash Tomar"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Student ID" placeholder="CS2201" value={sid} onChange={e => setSid(e.target.value)} />
            <Input label="Department" placeholder="CSE" value={dept} onChange={e => setDept(e.target.value)} />
          </div>
        </CardBody>
      </Card>

      {/* Camera */}
      <Card>
        <CardHeader>
          <CardTitle>Face Photos ({photos.length}/{MAX})</CardTitle>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setShowCam(v => !v)}>
              {showCam ? 'Hide' : 'Show'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}>
              ⟳
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {showCam && (
            <>
              <div className="camera-wrapper" style={{ aspectRatio: '4/3' }}>
                <Webcam
                  ref={wRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ width: 640, height: 480, facingMode: facing }}
                  mirrored={facing === 'user'}
                  className="cam-contain"
                />
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={capture}
                disabled={photos.length >= MAX}
              >
                📸 Capture Photo
              </Button>
            </>
          )}

          <div className="flex flex-wrap gap-1.5">
            {HINTS.map(h => (
              <span key={h} className="text-[10px] border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                {h}
              </span>
            ))}
          </div>

          <input ref={fRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
          <Button variant="outline" size="sm" className="w-full" onClick={() => fRef.current?.click()}>
            ↑ Upload from Gallery
          </Button>
        </CardBody>
      </Card>

      {/* Photo grid */}
      {photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Captured Photos</CardTitle>
            <Badge variant={photos.length >= 5 ? 'green' : 'yellow'}>
              {photos.length >= 5 ? '✓ Good quality' : `${5 - photos.length} more recommended`}
            </Badge>
          </CardHeader>
          <CardBody>
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div key={i} className="photo-thumb">
                  <img src={p.url} alt="" />
                  <button
                    className="remove"
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                  >✕</button>
                </div>
              ))}
              {photos.length < MAX && (
                <button className="photo-add" onClick={() => fRef.current?.click()}>
                  +
                </button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Feedback */}
      {msg && (
        <Alert variant={msg.type === 'ok' ? 'success' : msg.type === 'dup' ? 'warning' : 'error'}>
          {msg.type === 'ok'  && <span>✓</span>}
          {msg.type === 'dup' && <span>⚠</span>}
          {msg.type === 'err' && <span>✕</span>}
          <div>
            {msg.type === 'dup' && (
              <p className="font-medium text-sm">Duplicate face detected</p>
            )}
            <p className={msg.type === 'dup' ? 'text-xs mt-0.5' : 'text-sm'}>{msg.text}</p>
            {msg.type === 'dup' && (
              <p className="text-xs mt-1.5 opacity-80">
                Try photos with a different angle, better lighting, or without accessories.
              </p>
            )}
          </div>
        </Alert>
      )}

      <Button
        className="w-full"
        disabled={loading || !name.trim() || !photos.length}
        onClick={submit}
      >
        {loading
          ? <><Spinner size={14} /> Registering…</>
          : `Register · ${photos.length} photo${photos.length !== 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}
