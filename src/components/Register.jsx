import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Button, Card, CardHeader, CardTitle, CardBody, Input, Badge, Alert, Spinner } from './ui';
import { api } from '../utils/api';

const MAX = 10;
const HINTS = ['Front', 'Look left', 'Look right', 'Tilt up', 'With mask', 'With glasses'];

// --- Face Picker Component ---
function FacePicker({ imageUrl, faces, onSelect }) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = imageUrl;
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      faces.forEach((face, i) => {
        const [x1, y1, x2, y2] = face.bbox;
        const isHov = hovered === i;
        
        ctx.strokeStyle = isHov ? '#22c55e' : '#3b82f6';
        ctx.lineWidth = isHov ? 3 : 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        
        ctx.font = 'bold 13px Inter';
        ctx.fillStyle = (isHov ? '#22c55e' : '#3b82f6') + 'dd';
        ctx.fillRect(x1, y1 - 22, 70, 22);
        ctx.fillStyle = '#fff';
        ctx.fillText(isHov ? 'This is me' : `Face ${i + 1}`, x1 + 4, y1 - 6);
      });
    };
  }, [imageUrl, faces, hovered]);

  const handleClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    for (const face of faces) {
      const [x1, y1, x2, y2] = face.bbox;
      if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
        onSelect(face);
        return;
      }
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    let found = null;
    for (let i = 0; i < faces.length; i++) {
      const [x1, y1, x2, y2] = faces[i].bbox;
      if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
        found = i;
        break;
      }
    }
    setHovered(found);
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg border border-border cursor-pointer"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
    />
  );
}

// --- Main Register Component ---
export default function Register() {
  const wRef = useRef(null);
  const fRef = useRef(null);

  const [name, setName] = useState('');
  const [sid, setSid] = useState('');
  const [dept, setDept] = useState('');
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // {type:'ok'|'err'|'dup', text, dupName?}
  const [facing, setFacing] = useState('user');
  const [showCam, setShowCam] = useState(true);

  // Multi-face picker state
  const [multiFaces, setMultiFaces] = useState(null); // [{index, bbox, embedding}]
  const [faceImage, setFaceImage] = useState(null); // original image for drawing

  const capture = useCallback(() => {
    if (photos.length >= MAX) return;
    const src = wRef.current?.getScreenshot({ width: 640, height: 480 });
    if (!src) return;
    fetch(src)
      .then((r) => r.blob())
      .then((b) => setPhotos((p) => [...p, { blob: b, url: src }]));
  }, [photos.length]);

  // Updated onFiles to handle multi-face detection
  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX - photos.length);

    for (const file of files) {
      const url = URL.createObjectURL(file);
      const form = new FormData();
      form.append('image', file, 'check.jpg');

      try {
        // Check for multiple faces via API
        const result = await api.extractMulti(form);
        if (result.count > 1) {
          // Multiple faces found — show picker
          setMultiFaces(result.faces);
          setFaceImage(url);
          // Stop processing queue until user resolves this
          return; 
        }
        // Single face — add normally
        setPhotos((p) => [...p, { blob: file, url }]);
      } catch (err) {
        // If API fails or not configured, fallback to adding normally
        console.warn('Face extraction failed, adding blindly:', err);
        setPhotos((p) => [...p, { blob: file, url }]);
      }
    }
    e.target.value = '';
  };

  const submit = async () => {
    if (!name.trim()) return setMsg({ type: 'err', text: 'Full name is required.' });
    if (!photos.length) return setMsg({ type: 'err', text: 'Add at least 1 photo.' });

    setLoading(true);
    setMsg(null);

    const form = new FormData();
    form.append('name', name.trim());
    form.append('student_id', sid.trim());
    form.append('department', dept.trim());
    
    photos.forEach((p, i) => {
      if (p.blob) {
        form.append(`image_${i}`, p.blob, `p${i}.jpg`);
      } else if (p.preExtracted) {
        // If we only have embedding (from picker), append it as JSON string
        form.append(`embedding_${i}`, JSON.stringify(p.preExtracted));
        // Optionally append the URL or a placeholder if backend needs a file
        // Here we assume backend can handle embedding_ in place of image_
      }
    });

    try {
      const r = await api.register(form);
      setMsg({ type: 'ok', text: r.message });
      setName('');
      setSid('');
      setDept('');
      setPhotos([]);
    } catch (e) {
      // HTTP 409 = duplicate face detected
      if (e.message?.includes('409') || e.status === 409) {
        let detail = e.message;
        try {
          detail = JSON.parse(e.raw || '{}').error || detail;
        } catch {}
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
        <CardHeader>
          <CardTitle>Student Details</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            label="Full Name *"
            placeholder="e.g. Yash Tomar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Student ID" placeholder="CS2201" value={sid} onChange={(e) => setSid(e.target.value)} />
            <Input label="Department" placeholder="CSE" value={dept} onChange={(e) => setDept(e.target.value)} />
          </div>
        </CardBody>
      </Card>

      {/* Multi-Face Picker Popup */}
      {multiFaces && faceImage && (
        <Card>
          <CardHeader>
            <CardTitle>Multiple faces found — tap yours</CardTitle>
            <Badge variant="yellow">{multiFaces.length} people detected</Badge>
          </CardHeader>
          <CardBody>
            <FacePicker
              imageUrl={faceImage}
              faces={multiFaces}
              onSelect={(face) => {
                // User picked their face — store with pre-extracted embedding
                setPhotos((p) => [
                  ...p,
                  {
                    blob: null, // we already have the embedding
                    url: faceImage,
                    preExtracted: face.embedding, // skip HF call on submit
                  },
                ]);
                setMultiFaces(null);
                setFaceImage(null);
              }}
            />
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full mt-2" 
              onClick={() => { setMultiFaces(null); setFaceImage(null); }}
            >
              Cancel
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Camera */}
      <Card>
        <CardHeader>
          <CardTitle>Face Photos ({photos.length}/{MAX})</CardTitle>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setShowCam((v) => !v)}>
              {showCam ? 'Hide' : 'Show'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
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
            {HINTS.map((h) => (
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
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
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
          {msg.type === 'ok' && <span>✓</span>}
          {msg.type === 'dup' && <span>⚠</span>}
          {msg.type === 'err' && <span>✕</span>}
          <div>
            {msg.type === 'dup' && <p className="font-medium text-sm">Duplicate face detected</p>}
            <p className={msg.type === 'dup' ? 'text-xs mt-0.5' : 'text-sm'}>{msg.text}</p>
            {msg.type === 'dup' && (
              <p className="text-xs mt-1.5 opacity-80">Try photos with a different angle, better lighting, or without accessories.</p>
            )}
          </div>
        </Alert>
      )}

      <Button
        className="w-full"
        disabled={loading || !name.trim() || !photos.length}
        onClick={submit}
      >
        {loading ? (
          <>
            <Spinner size={14} /> Registering…
          </>
        ) : (
          `Register · ${photos.length} photo${photos.length !== 1 ? 's' : ''}`
        )}
      </Button>
    </div>
  );
}
