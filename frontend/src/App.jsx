import { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, Bell, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, Database, Download, Ellipsis, Filter, Gauge, Globe2, Menu, Pause, Play, Plus,
  Radio, RefreshCw, Search, ShieldAlert, ShieldCheck, Siren, Trash2, Waypoints, X
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import Sidebar from './components/Sidebar.jsx';
import StateDiagram from './components/StateDiagram.jsx';
import StatCard from './components/StatCard.jsx';
import useMonitoring from './hooks/useMonitoring.js';
import { api, formatTime } from './services/api.js';

const sourceOptions = ['192.168.1.10', '192.168.1.20', '10.0.0.15', '172.16.0.5'];
const defaultPorts = '21,22,23,25,53,80,110,443,3306,8080';
const navigationTitles = {
  overview: ['Operations overview', 'Real-time visibility into simulated network activity.'],
  connections: ['Connection monitor', 'Inspect and filter every simulated connection attempt.'],
  alerts: ['Security alerts', 'Investigate suspicious activity detected by the DFA engine.'],
  ports: ['Port analysis', 'Understand targeted services and suspicious traffic patterns.'],
  dfa: ['Finite automaton', 'Explore the state machine powering scan detection.']
};
const chartTooltip = { contentStyle: { background: '#111a2a', border: '1px solid #26354a', borderRadius: 9, color: '#e5edf8' }, itemStyle: { color: '#dce6f4' }, labelStyle: { color: '#8291a7' } };

function Badge({ children, tone = 'muted' }) {
  return <span className={`badge badge-${String(tone).toLowerCase()}`}>{children}</span>;
}

function EmptyState({ title, text, icon: Icon = Activity }) {
  return <div className="empty-state"><div><Icon size={20} /></div><strong>{title}</strong><p>{text}</p></div>;
}

function Panel({ title, subtitle, action, children, className = '' }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

function ConnectionTable({ items, dense = false }) {
  return <div className={`table-wrap ${dense ? 'table-dense' : ''}`}><table>
    <thead><tr><th>TIME</th><th>SOURCE IP</th><th>DESTINATION</th><th>PORT</th><th>PROTOCOL</th><th>STATUS</th><th>DFA STATE</th><th>RISK</th></tr></thead>
    <tbody>{items.map(log => <tr key={log._id}>
      <td className="time-cell">{formatTime(log.timestamp)}</td><td className="mono">{log.sourceIp}</td><td className="mono dim">{log.destinationIp}</td>
      <td><span className="port-chip">{log.destinationPort}</span></td><td>{log.protocol}</td>
      <td><Badge tone={log.status === 'BLOCKED' ? 'red' : log.status === 'TIMEOUT' ? 'orange' : 'green'}>{log.status}</Badge></td>
      <td><span className={`dfa-pill ${log.dfaState === 'Q3' || log.dfaState === 'Q4' ? 'dfa-risk' : ''}`}>{log.dfaState}</span></td>
      <td><Badge tone={log.riskLevel}>{log.riskLevel}</Badge></td>
    </tr>)}</tbody>
  </table>{items.length === 0 && <EmptyState title="No connection data yet" text="Start a local simulation to populate the monitor." icon={Radio} />}</div>;
}

function App() {
  const monitoring = useMonitoring();
  const { stats, analytics, alerts, setAlerts, connections, refreshConnections, status, loading, error, setError, refresh } = monitoring;
  const [page, setPage] = useState('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mode, setMode] = useState('sequential');
  const [sourceIp, setSourceIp] = useState(sourceOptions[0]);
  const [portsText, setPortsText] = useState(defaultPorts);
  const [intervalMs, setIntervalMs] = useState(400);
  const [busy, setBusy] = useState(false);
  const [connectionFilters, setConnectionFilters] = useState({ search: '', ip: '', port: '', status: '' });
  const [connectionPage, setConnectionPage] = useState(1);
  const [alertFilters, setAlertFilters] = useState({ search: '', severity: 'ALL', state: 'ALL' });
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showSimulator, setShowSimulator] = useState(true);

  const title = navigationTitles[page];
  const ports = useMemo(() => portsText.split(',').map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value >= 1 && value <= 65535), [portsText]);
  const filteredConnections = useMemo(() => {
    const filtered = connections.items.filter(item => {
      const query = connectionFilters.search.toLowerCase();
      return (!query || `${item.sourceIp} ${item.destinationIp} ${item.destinationPort} ${item.protocol} ${item.dfaState}`.toLowerCase().includes(query)) &&
        (!connectionFilters.ip || item.sourceIp.includes(connectionFilters.ip)) &&
        (!connectionFilters.port || String(item.destinationPort).includes(connectionFilters.port)) &&
        (!connectionFilters.status || item.status === connectionFilters.status);
    });
    const pageSize = 10;
    return { items: filtered.slice((connectionPage - 1) * pageSize, connectionPage * pageSize), totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)), total: filtered.length };
  }, [connections.items, connectionFilters, connectionPage]);
  const filteredAlerts = useMemo(() => alerts.filter(alert => {
    const query = alertFilters.search.toLowerCase();
    return (!query || `${alert.sourceIp} ${alert.attackType} ${alert.description}`.toLowerCase().includes(query)) &&
      (alertFilters.severity === 'ALL' || alert.severity === alertFilters.severity) &&
      (alertFilters.state === 'ALL' || String(alert.resolved) === alertFilters.state);
  }), [alerts, alertFilters]);
  const currentState = connections.items[0]?.dfaState || 'Q0';
  const transitions = connections.items.flatMap(log => (log.dfaTransitions || []).map(transition => ({ ...transition, sourceIp: log.sourceIp, port: log.destinationPort }))).slice(0, 12);

  async function handleStart() {
    const selectedPorts = mode === 'normal' ? [ports[0] || 443] : ports;
    if (!selectedPorts.length) return setError('Enter at least one valid port (1–65535).');
    setBusy(true);
    try {
      await api('/simulation/start', { method: 'POST', body: JSON.stringify({ mode, sourceIp, ports: selectedPorts, intervalMs, protocol: 'TCP' }) });
      setError('');
      await refresh();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function handleStop() {
    setBusy(true);
    try { await api('/simulation/stop', { method: 'POST' }); await refresh(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function clearData() {
    if (!window.confirm('Clear all simulated connection logs, alerts, and sessions?')) return;
    setBusy(true);
    try { await api('/simulation/data', { method: 'DELETE' }); setSelectedAlert(null); setError(''); await refresh(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function updateAlert(alert, resolved) {
    try {
      const updated = await api(`/alerts/${alert._id}`, { method: 'PUT', body: JSON.stringify({ resolved }) });
      setAlerts(current => current.map(item => item._id === updated._id ? updated : item));
      if (selectedAlert?._id === updated._id) setSelectedAlert(updated);
    } catch (requestError) { setError(requestError.message); }
  }

  async function deleteAlert(alert) {
    try {
      await api(`/alerts/${alert._id}`, { method: 'DELETE' });
      setAlerts(current => current.filter(item => item._id !== alert._id));
      if (selectedAlert?._id === alert._id) setSelectedAlert(null);
    } catch (requestError) { setError(requestError.message); }
  }

  function exportCsv() {
    const rows = [['Timestamp', 'Source IP', 'Destination IP', 'Port', 'Protocol', 'Status', 'DFA state', 'Risk']];
    for (const log of connections.items) rows.push([log.timestamp, log.sourceIp, log.destinationIp, log.destinationPort, log.protocol, log.status, log.dfaState, log.riskLevel]);
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'sentinel-connections.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function connectionSearch(value) {
    setConnectionFilters(current => ({ ...current, search: value }));
    setConnectionPage(1);
  }

  const content = page === 'overview' ? <Overview
    stats={stats} analytics={analytics} connections={connections.items} alerts={alerts}
    showSimulator={showSimulator} setShowSimulator={setShowSimulator} mode={mode} setMode={setMode}
    sourceIp={sourceIp} setSourceIp={setSourceIp} portsText={portsText} setPortsText={setPortsText}
    intervalMs={intervalMs} setIntervalMs={setIntervalMs} status={status} busy={busy} setPage={setPage}
    onStart={handleStart} onStop={handleStop} onClear={clearData} currentState={currentState}
  /> : page === 'connections' ? <ConnectionsPage
    items={filteredConnections.items} total={filteredConnections.total} page={connectionPage}
    totalPages={filteredConnections.totalPages} filters={connectionFilters} setFilters={setConnectionFilters}
    onSearch={connectionSearch} onExport={exportCsv} onPage={setConnectionPage} sourceIpFilter={sourceOptions}
  /> : page === 'alerts' ? <AlertsPage
    alerts={filteredAlerts} allAlerts={alerts} filters={alertFilters} setFilters={setAlertFilters} onSelect={setSelectedAlert}
    onResolve={updateAlert} onDelete={deleteAlert}
  /> : page === 'ports' ? <PortsPage analytics={analytics} connections={connections.items} /> :
    <DfaPage currentState={currentState} transitions={transitions} connections={connections.items} />;

  return <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
    <div className={`mobile-scrim ${mobileMenu ? 'visible' : ''}`} onClick={() => setMobileMenu(false)} />
    <div className={`sidebar-holder ${mobileMenu ? 'mobile-open' : ''}`}>
      <Sidebar page={page} setPage={id => { setPage(id); setMobileMenu(false); }} collapsed={collapsed} setCollapsed={setCollapsed} alertCount={alerts.filter(alert => !alert.resolved).length} />
    </div>
    <main className="main-area">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={19} /></button>
        <div className="breadcrumbs"><span>Sentinel console</span><span className="crumb-slash">/</span><strong>{title[0]}</strong></div>
        <div className="topbar-right">
          <div className="environment-tag"><span className="pulse-dot" />SIMULATION ENVIRONMENT</div>
          <div className="api-status"><span className={`status-light ${error ? 'offline' : loading ? 'connecting' : ''}`} />{error ? 'API offline' : loading ? 'Connecting' : 'System online'}</div>
          <button className="avatar" title="Local analyst profile">AS</button>
        </div>
      </header>
      <div className="page-content">
        <div className="page-title-row"><div><div className="eyebrow">SECURITY OPERATIONS CENTER <span>·</span> LIVE MONITORING</div><h1>{title[0]}</h1><p>{title[1]}</p></div>
          <div className="title-actions"><span className="last-updated"><Clock3 size={14} />Live · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><button className="button button-secondary" onClick={() => refresh().catch(error => setError(error.message))}><RefreshCw size={15} /> Refresh</button></div>
        </div>
        {error && <div className="error-banner"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {loading && !stats ? <div className="loading-view"><div className="spinner" /><strong>Connecting to monitoring service</strong><span>Waiting for MongoDB-backed API…</span></div> : !stats ? <div className="loading-view"><AlertTriangle size={22} /><strong>Monitoring data unavailable</strong><span>{error || 'No database-backed dashboard data is available.'}</span><button className="button button-secondary" onClick={() => refresh().catch(error => setError(error.message))}><RefreshCw size={14} /> Retry connection</button></div> : content}
        <footer className="page-footer"><span>Sentinel <b>·</b> Educational port-scan detection</span><span><ShieldCheck size={13} /> All traffic is simulated locally</span></footer>
      </div>
    </main>
    {selectedAlert && <AlertDialog alert={selectedAlert} onClose={() => setSelectedAlert(null)} onResolve={updateAlert} onDelete={deleteAlert} />}
  </div>;
}

function Simulator({ mode, setMode, sourceIp, setSourceIp, portsText, setPortsText, intervalMs, setIntervalMs, status, busy, onStart, onStop, onClear }) {
  return <Panel className="simulator-panel" title={<span><Radio size={16} /> Traffic simulator</span>} subtitle="Generate local-only traffic for DFA analysis" action={<span className={`sim-running ${status.running ? 'running' : ''}`}><i />{status.running ? 'RUNNING' : 'STOPPED'}</span>}>
    <div className="sim-controls">
      <label>TRAFFIC PROFILE<select value={mode} onChange={event => setMode(event.target.value)} disabled={status.running}><option value="normal">Normal connections</option><option value="sequential">Sequential port scan</option><option value="random">Random port scan</option></select></label>
      <label>SOURCE IP<select value={sourceIp} onChange={event => setSourceIp(event.target.value)} disabled={status.running}>{sourceOptions.map(ip => <option key={ip}>{ip}</option>)}</select></label>
      <label className="ports-input">DESTINATION PORTS<input value={portsText} onChange={event => setPortsText(event.target.value)} placeholder="22,80,443,8080" disabled={status.running || mode === 'normal'} /><small>{mode === 'normal' ? 'One service port for typical traffic' : 'Comma separated · 1–65535'}</small></label>
      <label className="speed-control">INTERVAL <span>{intervalMs} ms</span><input type="range" min="100" max="2000" step="100" value={intervalMs} disabled={status.running} onChange={event => setIntervalMs(Number(event.target.value))} /><small>{intervalMs <= 300 ? 'Fast' : intervalMs <= 800 ? 'Balanced' : 'Slow'} · one attempt per interval</small></label>
    </div>
    <div className="sim-footer"><div className="sim-disclaimer"><ShieldCheck size={15} /><span>Simulated events only. No packets leave this application.</span></div><div className="sim-actions">
      {status.running ? <button className="button button-danger" onClick={onStop} disabled={busy}><Pause size={15} /> Stop simulation</button> : <button className="button button-primary" onClick={onStart} disabled={busy}><Play size={15} fill="currentColor" /> Start simulation</button>}
      <button className="button button-ghost" onClick={onClear} disabled={busy}><Trash2 size={15} /> Clear data</button>
    </div></div>
  </Panel>;
}

function Overview({ stats, analytics, connections, alerts, showSimulator, setShowSimulator, ...simProps }) {
  const trafficMix = [
    { name: 'Normal', value: stats?.normalConnections || 0, color: '#29d69a' },
    { name: 'Suspicious', value: stats?.suspiciousConnections || 0, color: '#ff725e' }
  ];
  return <div className="dashboard-stack">
    <div className="stat-grid">
      <StatCard label="Connection attempts" value={(stats?.totalAttempts ?? 0).toLocaleString()} note="All simulated connections" icon={Activity} tone="blue" />
      <StatCard label="Unique source IPs" value={(stats?.uniqueSources ?? 0).toLocaleString()} note="Observed in current data" icon={Globe2} tone="purple" />
      <StatCard label="Detected port scans" value={(stats?.detectedScans ?? 0).toLocaleString()} note="DFA flagged connections" icon={Siren} tone="orange" />
      <StatCard label="Critical alerts" value={(stats?.criticalAlerts ?? 0).toLocaleString()} note="Unresolved · requires review" icon={ShieldAlert} tone="red" />
      <StatCard label="Normal connections" value={(stats?.normalConnections ?? 0).toLocaleString()} note="Below detection threshold" icon={ShieldCheck} tone="green" />
      <StatCard label="Suspicious connections" value={(stats?.suspiciousConnections ?? 0).toLocaleString()} note="Possible or confirmed scans" icon={AlertTriangle} tone="orange" />
    </div>
    <div className="chart-grid">
      <Panel title="Connection activity" subtitle="Recent simulated attempts · grouped by minute" action={<span className="chart-legend"><i className="legend-dot green" />Normal <i className="legend-dot red" />Suspicious</span>}>
        {analytics.timeline.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.timeline} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}><defs><linearGradient id="normalGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#31d59c" stopOpacity={0.2} /><stop offset="95%" stopColor="#31d59c" stopOpacity={0} /></linearGradient><linearGradient id="suspiciousGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff715f" stopOpacity={0.2} /><stop offset="95%" stopColor="#ff715f" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#202c3e" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" stroke="#718198" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><YAxis stroke="#718198" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip {...chartTooltip} /><Area type="monotone" dataKey="normal" stroke="#30d59a" strokeWidth={2} fill="url(#normalGradient)" /><Area type="monotone" dataKey="suspicious" stroke="#ff715f" strokeWidth={2} fill="url(#suspiciousGradient)" /></AreaChart></ResponsiveContainer></div> : <EmptyState title="Waiting for traffic" text="Run a simulation to see connection activity here." /> }
      </Panel>
      <Panel title="Traffic classification" subtitle="Normal vs suspicious connections">
        {stats?.totalAttempts ? <div className="traffic-chart"><ResponsiveContainer width="58%" height="100%"><PieChart><Pie data={trafficMix} dataKey="value" nameKey="name" innerRadius={57} outerRadius={78} paddingAngle={4} stroke="none">{trafficMix.map(item => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip {...chartTooltip} /></PieChart></ResponsiveContainer><div className="traffic-total"><strong>{stats.totalAttempts.toLocaleString()}</strong><small>attempts</small></div></div> : <EmptyState title="No traffic to classify" text="Classification appears after the first connection." />}
        <div className="mix-legend"><span><i className="legend-dot green" />Normal <b>{stats?.normalConnections ?? 0}</b></span><span><i className="legend-dot red" />Suspicious <b>{stats?.suspiciousConnections ?? 0}</b></span></div>
      </Panel>
    </div>
    <div className="chart-grid">
      <Panel title="Port activity" subtitle="Most frequently targeted destination ports" action={<button className="text-button" onClick={() => simProps.setPage?.('ports')}>Full analysis <ArrowRight size={14} /></button>}>
        {analytics.byPort.length ? <div className="port-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.byPort.slice(0, 8)} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="#202c3e" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="port" stroke="#718198" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><YAxis stroke="#718198" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip {...chartTooltip} /><Bar dataKey="attempts" radius={[4, 4, 0, 0]}>{analytics.byPort.slice(0, 8).map(item => <Cell key={item.port} fill={item.suspicious ? '#f27c58' : '#3789e8'} />)}</Bar></BarChart></ResponsiveContainer></div> : <EmptyState title="No ports analyzed" text="Simulated connection attempts will appear here." />}
      </Panel>
      <Panel title="Top suspicious sources" subtitle="Sources with scan or rapid-attempt activity" action={<Badge tone="orange">{analytics.bySource.length} SOURCES</Badge>}>
        {analytics.bySource.length ? <div className="source-list">{analytics.bySource.map((item, index) => <div className="source-row" key={item.ip}><span className="source-rank">0{index + 1}</span><span className="mono">{item.ip}</span><div className="source-bar"><i style={{ width: `${Math.min(100, item.attempts / Math.max(...analytics.bySource.map(row => row.attempts)) * 100)}%` }} /></div><Badge tone="orange">{item.attempts}</Badge></div>)}</div> : <EmptyState title="No suspicious sources" text="A source appears after scan detection or a rapid-attempt alert." />}
      </Panel>
    </div>
    {showSimulator && <Simulator {...simProps} />}
    <div className="lower-grid">
      <Panel title="DFA state machine" subtitle="Current active state from recent connection" action={<span className="active-state-tag"><i />{connections[0]?.dfaState || 'Q0'} ACTIVE</span>}>
        <StateDiagram compact currentState={connections[0]?.dfaState || 'Q0'} />
      </Panel>
      <Panel title="Recent security alerts" subtitle="Latest DFA detections" action={<span className="alert-count">{alerts.filter(alert => !alert.resolved).length} unresolved</span>}>
        {alerts.length ? <div className="recent-alerts">{alerts.slice(0, 4).map(alert => <div className="recent-alert" key={alert._id}><span className={`alert-indicator sev-${alert.severity.toLowerCase()}`}><AlertTriangle size={14} /></span><div><strong>{alert.attackType}</strong><small>{alert.sourceIp} · {formatTime(alert.timestamp)}</small></div><Badge tone={alert.severity}>{alert.severity}</Badge></div>)}</div> : <EmptyState title="No alerts generated" text="Alerts are created automatically when the DFA sees a scan pattern." icon={Bell} />}
      </Panel>
    </div>
    <Panel title="Live connection feed" subtitle="Latest logged simulated attempts" action={<span className="live-tag"><i />LIVE FEED</span>}><ConnectionTable items={connections.slice(0, 6)} dense /></Panel>
  </div>;
}

function ConnectionsPage({ items, total, page, totalPages, filters, setFilters, onSearch, onExport, onPage, sourceIpFilter }) {
  const change = (key, value) => { setFilters(current => ({ ...current, [key]: value })); onPage(1); };
  return <div className="dashboard-stack">
    <Panel title="Connection logs" subtitle={`${total} matching records · newest first`} action={<button className="button button-secondary" onClick={onExport}><Download size={15} /> Export CSV</button>}>
      <div className="filter-toolbar">
        <label className="search-field"><Search size={16} /><input placeholder="Search IP, port, protocol…" value={filters.search} onChange={event => onSearch(event.target.value)} /></label>
        <label className="filter-select"><Filter size={15} /><select value={filters.ip} onChange={event => change('ip', event.target.value)}><option value="">All source IPs</option>{sourceIpFilter.map(ip => <option key={ip}>{ip}</option>)}</select><ChevronDown size={13} /></label>
        <label className="filter-select"><select aria-label="Filter by status" value={filters.status} onChange={event => change('status', event.target.value)}><option value="">All statuses</option><option>ESTABLISHED</option><option>BLOCKED</option><option>TIMEOUT</option></select><ChevronDown size={13} /></label>
        <label className="port-filter"><input aria-label="Filter by port" type="number" min="1" max="65535" placeholder="Port…" value={filters.port} onChange={event => change('port', event.target.value)} /></label>
      </div>
      <ConnectionTable items={items} />
      <div className="pagination"><span>Page {page} of {totalPages}</span><div><button className="icon-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button><button className="icon-button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div>
    </Panel>
    <p className="table-note"><CircleHelp size={14} /> Connection logs are retained in MongoDB. CSV export includes the latest 100 records.</p>
  </div>;
}

function AlertsPage({ alerts, allAlerts = alerts, filters, setFilters, onSelect, onResolve, onDelete }) {
  const set = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  return <div className="dashboard-stack">
    <div className="alert-summary">
      {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(severity => <div className={`severity-card sev-card-${severity.toLowerCase()}`} key={severity}><span>{severity}</span><strong>{allAlerts.filter(alert => alert.severity === severity && !alert.resolved).length}</strong><small>unresolved</small></div>)}
    </div>
    <Panel title="Alert queue" subtitle={`${alerts.length} matching alerts`} action={<label className="filter-select"><select value={filters.severity} onChange={event => set('severity', event.target.value)}><option value="ALL">All severities</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select><ChevronDown size={13} /></label>}>
      <div className="filter-toolbar"><label className="search-field"><Search size={16} /><input placeholder="Search source IP or alert details…" value={filters.search} onChange={event => set('search', event.target.value)} /></label><label className="filter-select"><select value={filters.state} onChange={event => set('state', event.target.value)}><option value="ALL">All alerts</option><option value="false">Unresolved</option><option value="true">Resolved</option></select><ChevronDown size={13} /></label></div>
      {alerts.length ? <div className="table-wrap"><table><thead><tr><th>ALERT</th><th>SOURCE IP</th><th>DETECTED PORTS</th><th>ATTACK TYPE</th><th>DETECTED</th><th>SEVERITY</th><th>DFA</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{alerts.map(alert => <tr key={alert._id}>
        <td className="mono dim">{alert._id.slice(-8).toUpperCase()}</td><td className="mono">{alert.sourceIp}</td><td><span className="port-list">{alert.detectedPorts.slice(0, 4).join(', ')}{alert.detectedPorts.length > 4 ? ` +${alert.detectedPorts.length - 4}` : ''}</span></td><td>{alert.attackType}</td><td className="time-cell">{formatTime(alert.timestamp)}</td><td><Badge tone={alert.severity}>{alert.severity}</Badge></td><td><span className="dfa-pill dfa-risk">{alert.dfaState}</span></td><td><Badge tone={alert.resolved ? 'green' : 'orange'}>{alert.resolved ? 'RESOLVED' : 'OPEN'}</Badge></td>
        <td><div className="row-actions"><button title="View details" onClick={() => onSelect(alert)} className="icon-button"><CircleHelp size={15} /></button>{!alert.resolved && <button title="Mark resolved" onClick={() => onResolve(alert, true)} className="icon-button"><Check size={15} /></button>}<button title="Delete alert" onClick={() => onDelete(alert)} className="icon-button danger-hover"><Trash2 size={15} /></button></div></td>
      </tr>)}</tbody></table></div> : <EmptyState title="No matching alerts" text="When five unique ports are accessed within ten seconds, the DFA creates an alert." icon={Bell} />}
    </Panel>
    <div className="alert-guidance"><ShieldCheck size={17} /><span><strong>Detection policy</strong> — Alerts are generated at five unique ports (HIGH) and ten unique ports (CRITICAL) per source IP within the configured 10-second window.</span></div>
  </div>;
}

function PortsPage({ analytics, connections }) {
  const statusByPort = useMemo(() => {
    const map = new Map();
    for (const item of connections) {
      const entry = map.get(item.destinationPort) || { port: item.destinationPort, attempts: 0, suspicious: 0, sources: new Set() };
      entry.attempts += 1;
      entry.suspicious += item.scanDetected ? 1 : 0;
      entry.sources.add(item.sourceIp);
      map.set(item.destinationPort, entry);
    }
    return [...map.values()].sort((a, b) => b.attempts - a.attempts);
  }, [connections]);
  return <div className="dashboard-stack">
    <div className="port-intro"><div className="port-intro-icon"><Database size={20} /></div><div><strong>Simulated service exposure</strong><p>Port status is inferred from generated connection responses; no actual sockets are probed.</p></div><Badge tone="blue">SIMULATION DATA</Badge></div>
    <div className="chart-grid port-page-charts">
      <Panel title="Targeted ports" subtitle="Connection volume by destination port">{analytics.byPort.length ? <div className="chart-area tall-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.byPort} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="#202c3e" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="port" stroke="#718198" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><YAxis stroke="#718198" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip {...chartTooltip} /><Bar dataKey="attempts" fill="#438fe6" radius={[4, 4, 0, 0]} /><Bar dataKey="suspicious" fill="#f27857" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No port activity" text="Run a local simulation to analyze destination ports." />}</Panel>
      <Panel title="Top suspicious sources" subtitle="Source IPs with scan activity">{analytics.bySource.length ? <div className="source-list">{analytics.bySource.map((item, index) => <div className="source-row" key={item.ip}><span className="source-rank">0{index + 1}</span><span className="mono">{item.ip}</span><div className="source-bar"><i style={{ width: `${Math.min(100, item.attempts / Math.max(...analytics.bySource.map(row => row.attempts)) * 100)}%` }} /></div><Badge tone="orange">{item.attempts}</Badge></div>)}</div> : <EmptyState title="No suspicious sources" text="Source analysis appears after scan detection." />}</Panel>
    </div>
    <Panel title="Port inventory" subtitle="Observed ports in the current connection history">
      {statusByPort.length ? <div className="table-wrap"><table><thead><tr><th>PORT</th><th>COMMON SERVICE</th><th>SIMULATED STATUS</th><th>ATTEMPTS</th><th>SUSPICIOUS</th><th>SOURCE IPS</th><th>SCAN FREQUENCY</th></tr></thead><tbody>{statusByPort.map(item => { const service = portService(item.port); const simulatedOpen = service !== 'Unknown service'; return <tr key={item.port}><td><span className="port-chip">{item.port}</span></td><td>{service}</td><td><Badge tone={simulatedOpen ? 'green' : 'muted'}>{simulatedOpen ? 'OPEN · SIMULATED' : 'CLOSED · SIMULATED'}</Badge></td><td>{item.attempts}</td><td>{item.suspicious}</td><td>{item.sources.size}</td><td><div className="frequency"><i style={{ width: `${item.attempts / Math.max(...statusByPort.map(row => row.attempts)) * 100}%` }} /></div></td></tr>; })}</tbody></table></div> : <EmptyState title="Port inventory is empty" text="Generated traffic will be grouped by destination port." />}
    </Panel>
  </div>;
}

function portService(port) {
  return ({ 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 3306: 'MySQL', 5432: 'PostgreSQL', 8080: 'HTTP alternate' })[port] || 'Unknown service';
}

function DfaPage({ currentState, transitions, connections }) {
  return <div className="dashboard-stack">
    <div className="dfa-explainer"><div className="dfa-explainer-icon"><Waypoints size={23} /></div><div><div className="eyebrow">DETERMINISTIC FINITE AUTOMATON</div><h2>Patterns become states.</h2><p>Each source IP is tracked independently. Every new unique destination port advances its DFA; repeats do not increase the scan count. Ten seconds of inactivity resets that source to the initial state.</p></div><div className="current-state-card"><small>CURRENT ACTIVE STATE</small><strong className={currentState === 'Q3' || currentState === 'Q4' ? 'text-red' : 'text-green'}>{currentState}</strong><span>{connections.length ? `Source ${connections[0].sourceIp}` : 'No active connection'}</span></div></div>
    <Panel title="State transition diagram" subtitle="Input alphabet: new port · repeated port · connection timeout"><StateDiagram currentState={currentState} /></Panel>
    <div className="dfa-info-grid">
      <Panel title="Transition rules" subtitle="State advances on distinct ports within the 10-second window">
        <div className="transition-table"><div className="transition-head"><span>FROM</span><span>INPUT SYMBOL</span><span>CONDITION</span><span>TO</span></div>
          <div><b>Q0</b><span><Badge tone="blue">new_port</Badge></span><span>First unique port</span><b>Q1</b></div>
          <div><b>Q1</b><span><Badge tone="blue">new_port</Badge></span><span>2nd unique port</span><b>Q2</b></div>
          <div><b>Q2</b><span><Badge tone="blue">new_port</Badge></span><span>5th unique port</span><b className="text-orange">Q3</b></div>
          <div><b>Q3</b><span><Badge tone="blue">new_port</Badge></span><span>10th unique port</span><b className="text-red">Q4</b></div>
          <div><b>Any</b><span><Badge tone="muted">repeated_port</Badge></span><span>Same destination port</span><b>Same state</b></div>
          <div><b>Any</b><span><Badge tone="muted">connection_timeout</Badge></span><span>10 seconds elapsed</span><b>Q0</b></div>
        </div>
      </Panel>
      <Panel title="Accepted & rejected patterns" subtitle="How the detector classifies traffic">
        <div className="pattern-card accepted"><div><ShieldAlert size={16} /><strong>Accepted · scan detected</strong></div><p>5+ distinct ports from the same source within 10 seconds. Q3 marks a possible scan; Q4 confirms at 10+.</p></div>
        <div className="pattern-card rejected"><div><ShieldCheck size={16} /><strong>Rejected · normal / repeat traffic</strong></div><p>Repeated attempts to one port do not increase the distinct-port count. Fewer than five unique ports do not trigger a scan alert.</p></div>
        <div className="input-alphabet"><strong>Alphabet Σ</strong><Badge tone="blue">new_port</Badge><Badge tone="muted">repeated_port</Badge><Badge tone="muted">connection_timeout</Badge></div>
      </Panel>
    </div>
    <Panel title="Recent DFA transitions" subtitle="Transitions are stored with their source, port, input symbol, and timestamp">
      {transitions.length ? <div className="table-wrap"><table><thead><tr><th>TIMESTAMP</th><th>SOURCE IP</th><th>DESTINATION PORT</th><th>INPUT SYMBOL</th><th>PREVIOUS</th><th>CURRENT</th></tr></thead><tbody>{transitions.map((item, index) => <tr key={`${item.timestamp}-${index}`}><td className="time-cell">{formatTime(item.timestamp)}</td><td className="mono">{item.sourceIp}</td><td><span className="port-chip">{item.port}</span></td><td><Badge tone={item.inputSymbol === 'new_port' ? 'blue' : 'muted'}>{item.inputSymbol}</Badge></td><td><span className="dfa-pill">{item.previousState}</span></td><td><span className={`dfa-pill ${item.currentState === 'Q3' || item.currentState === 'Q4' ? 'dfa-risk' : ''}`}>{item.currentState}</span></td></tr>)}</tbody></table></div> : <EmptyState title="No DFA transitions yet" text="Start a simulation and each transition will be persisted and shown here." icon={Waypoints} />}
    </Panel>
  </div>;
}

function AlertDialog({ alert, onClose, onResolve, onDelete }) {
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="alert-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
    <div className="dialog-heading"><div><span className={`alert-indicator sev-${alert.severity.toLowerCase()}`}><AlertTriangle size={15} /></span><div><div className="eyebrow">SECURITY ALERT · {alert._id.slice(-8).toUpperCase()}</div><h2 id="dialog-title">{alert.attackType}</h2></div></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    <p className="dialog-description">{alert.description}</p>
    <div className="dialog-details"><div><small>SOURCE IP</small><strong className="mono">{alert.sourceIp}</strong></div><div><small>SEVERITY</small><Badge tone={alert.severity}>{alert.severity}</Badge></div><div><small>DFA STATE</small><span className="dfa-pill dfa-risk">{alert.dfaState}</span></div><div><small>DETECTION TIME</small><strong>{formatTime(alert.timestamp)}</strong></div><div className="detail-wide"><small>DETECTED PORTS · {alert.detectedPorts.length} UNIQUE</small><div className="detail-port-list">{alert.detectedPorts.map(port => <span className="port-chip" key={port}>{port}</span>)}</div></div><div><small>ALERT STATUS</small><Badge tone={alert.resolved ? 'green' : 'orange'}>{alert.resolved ? 'RESOLVED' : 'OPEN'}</Badge></div></div>
    <div className="dialog-actions"><button className="button button-ghost" onClick={() => onDelete(alert)}><Trash2 size={15} /> Delete alert</button>{!alert.resolved && <button className="button button-primary" onClick={() => onResolve(alert, true)}><Check size={15} /> Mark resolved</button>}</div>
  </section></div>;
}

export default App;
