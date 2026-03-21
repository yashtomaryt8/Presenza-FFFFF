import React from 'react';
import Logo from './Logo';
import { cn } from './ui';

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', icon: '⊞', label: 'Dashboard' },
      { id: 'scanner',   icon: '◎', label: 'Live Scanner' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'register',  icon: '⊕', label: 'Register' },
      { id: 'logs',      icon: '≡', label: 'Logs' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'analytics', icon: '◇', label: 'Analytics' },
      { id: 'settings',  icon: '⚙', label: 'Settings' },
    ],
  },
];

export default function Sidebar({ tab, setTab, health, onSearch }) {
  return (
    <aside className="sidebar">
      {/* Logo area */}
      <div className="flex items-center gap-3 h-14 px-4 border-b border-border flex-shrink-0">
        <Logo />
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={onSearch}
          className="flex items-center gap-2 w-full h-8 px-2.5 rounded-md text-xs text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
        >
          <span className="text-sm">⌕</span>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[9px] bg-background border border-border rounded px-1 py-0.5 font-mono opacity-60">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mb-1">
            <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
              {section.label}
            </p>
            {section.items.map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex items-center gap-2.5 w-full px-3 py-1.5 mx-1 text-sm rounded-md transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  tab === item.id
                    ? 'bg-secondary text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                style={{ width: 'calc(100% - 8px)' }}
              >
                <span className={cn('text-base w-5 text-center leading-none flex-shrink-0', tab === item.id ? 'opacity-100' : 'opacity-60')}>
                  {item.icon}
                </span>
                {item.label}
                {tab === item.id && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-foreground/60" />
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer - health status */}
      <div className="border-t border-border p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-1">
          <span className={`dot ${health?.ok ? 'dot-green' : 'dot-red'} ${health?.ok ? 'dot-pulse' : ''}`} />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">
              {health?.ok ? 'System Online' : 'Offline'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {health?.ok ? `${health.users} registered` : 'Check Railway'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
