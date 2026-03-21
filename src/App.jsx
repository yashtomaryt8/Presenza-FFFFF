import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DynamicIslandNav from './components/DynamicIslandNav';
import GlobalSearch from './components/GlobalSearch';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Register from './components/Register';
import Logs from './components/Logs';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import { api } from './utils/api';

export default function App() {
  const [tab,         setTab]         = useState('dashboard');
  const [health,      setHealth]      = useState(null);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const ping = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth({ ok: true, users: h.users, hf: h.hf_space });
    } catch {
      setHealth({ ok: false });
    }
  }, []);

  useEffect(() => {
    ping();
    const t = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [ping]);

  // ⌘K shortcut
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const handleTabChange = (t) => {
    setTab(t);
    setSidebarOpen(false);
  };

  const pages = {
    dashboard: <Dashboard setTab={setTab} />,
    scanner:   <Scanner />,
    register:  <Register />,
    logs:      <Logs />,
    analytics: <Analytics />,
    settings:  <Settings health={health} />,
  };

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar tab={tab} setTab={handleTabChange} health={health} onSearch={() => setSearchOpen(true)} />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <>
          <div className="sidebar-mobile-overlay lg:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="sidebar open lg:hidden">
            <Sidebar tab={tab} setTab={handleTabChange} health={health} onSearch={() => { setSidebarOpen(false); setSearchOpen(true); }} />
          </div>
        </>
      )}

      {/* Main content area */}
      <div className="main-area">
        <Header
          tab={tab}
          health={health}
          onSearch={() => setSearchOpen(true)}
          onMenuOpen={() => setSidebarOpen(true)}
        />
        <div className="page-scroll">
          <div className="page-content">
            {pages[tab] || pages.dashboard}
          </div>
        </div>
      </div>

      {/* Mobile Dynamic Island nav */}
      <DynamicIslandNav tab={tab} setTab={handleTabChange} />

      {/* Global search */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
