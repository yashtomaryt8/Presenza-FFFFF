import React, { useState, useEffect } from 'react';
import Logo from './Logo';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  scanner:   'Live Scanner',
  register:  'Register Student',
  logs:      'Attendance Logs',
  analytics: 'Analytics',
  settings:  'Settings',
};

export default function Header({ tab, onSearch, onMenuOpen, health }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('presenza-theme', next ? 'dark' : 'light');
  };

  useEffect(() => {
    const saved = localStorage.getItem('presenza-theme');
    if (saved === 'dark') { setDark(true); document.documentElement.classList.add('dark'); }
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 flex-shrink-0">
      {/* Left: hamburger (mobile) + logo (mobile) */}
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          onClick={onMenuOpen}
          aria-label="Open menu"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden">
          <Logo />
        </div>

        {/* Desktop page title */}
        <h1 className="hidden lg:block text-sm font-semibold">
          {PAGE_TITLES[tab] || 'Dashboard'}
        </h1>
      </div>

      {/* Right: search + theme + status */}
      <div className="flex items-center gap-2">
        {/* Desktop search */}
        <button
          onClick={onSearch}
          className="hidden md:flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <span>⌕</span>
          <span>Search</span>
          <kbd className="ml-3 font-mono text-[9px] text-muted-foreground/50 bg-muted border border-border rounded px-1">⌘K</kbd>
        </button>

        {/* Mobile search icon */}
        <button
          onClick={onSearch}
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          <span className="text-base">⌕</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          title={dark ? 'Switch to light' : 'Switch to dark'}
        >
          {dark
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          }
        </button>

        {/* Status dot (mobile) */}
        <div className="flex items-center gap-1.5">
          <span className={`dot ${health?.ok ? 'dot-green' : 'dot-red'} ${health?.ok ? 'dot-pulse' : ''}`} />
        </div>
      </div>
    </header>
  );
}
