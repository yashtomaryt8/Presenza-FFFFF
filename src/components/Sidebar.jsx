import React from 'react';
import Logo from './Logo';
import { cn } from './ui';

// Inline SVG icons — consistent 16px, clean lines
const Icons = {
  Home:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Scan:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>,
  UserPlus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  List:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Chart:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  Settings: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Search:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Circle:   () => <svg width="5" height="5" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="5"/></svg>,
};

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', Icon: Icons.Home,     label: 'Dashboard' },
      { id: 'scanner',   Icon: Icons.Scan,     label: 'Live Scanner' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'register',  Icon: Icons.UserPlus, label: 'Register' },
      { id: 'logs',      Icon: Icons.List,     label: 'Logs' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'analytics', Icon: Icons.Chart,    label: 'Analytics' },
      { id: 'settings',  Icon: Icons.Settings, label: 'Settings' },
    ],
  },
];

export default function Sidebar({ tab, setTab, health, onSearch }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-border flex-shrink-0">
        <Logo />
      </div>

      {/* Search trigger */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={onSearch}
          className="flex items-center gap-2 w-full h-8 px-2.5 rounded-md text-xs text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
        >
          <Icons.Search />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[9px] bg-background border border-border rounded px-1 py-0.5 font-mono opacity-60">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mb-1">
            <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
              {section.label}
            </p>
            {section.items.map(({ id, Icon, label }) => {
              const isActive = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex items-center gap-2.5 mx-1 px-3 py-1.5 text-sm rounded-md transition-colors w-[calc(100%-8px)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-secondary text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <span className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-60')}>
                    <Icon />
                  </span>
                  <span className="flex-1 text-left">{label}</span>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground/50 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Status footer */}
      <div className="border-t border-border p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-1">
          <span className={`dot ${health?.ok ? 'dot-green dot-pulse' : 'dot-red'}`} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
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
