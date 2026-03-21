import React from 'react';

const NAV = [
  { id: 'dashboard', icon: '⊞', label: 'Home'  },
  { id: 'scanner',   icon: '◎', label: 'Scan'  },
  { id: 'register',  icon: '⊕', label: 'Add'   },
  { id: 'logs',      icon: '≡', label: 'Logs'  },
  { id: 'analytics', icon: '◇', label: 'Stats' },
  { id: 'settings',  icon: '⚙', label: 'More'  },
];

export default function DynamicIslandNav({ tab, setTab }) {
  return (
    <nav className="di-nav" role="navigation">
      {NAV.map(n => (
        <button
          key={n.id}
          className={`di-btn ${tab === n.id ? 'active' : ''}`}
          onClick={() => setTab(n.id)}
          aria-label={n.label}
        >
          <span className="di-icon">{n.icon}</span>
          <span className="di-label">{n.label}</span>
        </button>
      ))}
    </nav>
  );
}
