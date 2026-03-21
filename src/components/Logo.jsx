import React, { useState, useEffect } from 'react';

const CYCLES = [
  { text: 'resenza', color: 'hsl(var(--foreground))' },
  { text: 'Flow',    color: '#3b82f6' },
  { text: 'Scan',    color: '#10b981' },
  { text: 'Sync',    color: '#8b5cf6' },
];

export default function Logo() {
  const [idx, setIdx]       = useState(0);
  const [going, setGoing]   = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setGoing(true);
      setTimeout(() => { setIdx(i => (i + 1) % CYCLES.length); setGoing(false); }, 320);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const cur = CYCLES[idx];

  return (
    <span className="flex items-baseline gap-0 select-none" style={{ fontFamily: 'Inter, sans-serif' }}>
      <span className="text-[18px] font-bold tracking-tight" style={{ color: 'hsl(var(--foreground))' }}>P</span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: cur.color,
          display: 'inline-block',
          transform: going ? 'translateY(-8px)' : 'translateY(0)',
          opacity: going ? 0 : 1,
          transition: 'transform 0.3s ease, opacity 0.3s ease',
        }}
      >
        {cur.text}
      </span>
    </span>
  );
}
