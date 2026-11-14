import { Activity, Bell, ChartNoAxesColumn, ChevronLeft, ChevronRight, CircleDot, Network, Shield, Waypoints } from 'lucide-react';

const items = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'connections', label: 'Connections', icon: Network },
  { id: 'alerts', label: 'Security alerts', icon: Bell },
  { id: 'ports', label: 'Port analysis', icon: ChartNoAxesColumn },
  { id: 'dfa', label: 'DFA engine', icon: Waypoints }
];

export default function Sidebar({ page, setPage, collapsed, setCollapsed, alertCount }) {
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><Shield size={20} /></div>
        {!collapsed && <div><strong>sentinel<span>.</span></strong><small>THREAT MONITOR</small></div>}
        <button className="icon-button collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <div className="nav-caption">{!collapsed && 'WORKSPACE'}</div>
      <nav className="nav-list" aria-label="Main navigation">
        {items.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)} title={collapsed ? label : undefined}>
            <Icon size={18} strokeWidth={1.8} /><span>{!collapsed && label}</span>
            {id === 'alerts' && alertCount > 0 && <b className="nav-count">{alertCount}</b>}
          </button>
        ))}
      </nav>
      {!collapsed && <div className="sidebar-bottom">
        <div className="simulation-note"><CircleDot size={15} /><span>LOCAL SIMULATION ONLY</span></div>
        <p>Traffic is generated locally for educational analysis. No external targets are contacted.</p>
        <div className="sidebar-version">SENTINEL CONSOLE <span>v1.0</span></div>
      </div>}
    </aside>
  );
}
