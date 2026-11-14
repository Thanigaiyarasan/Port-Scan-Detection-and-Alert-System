import { useCallback, useEffect, useRef, useState } from 'react';
import { api, connectSocket } from '../services/api.js';

export default function useMonitoring() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState({ byPort: [], bySource: [], timeline: [] });
  const [alerts, setAlerts] = useState([]);
  const [connections, setConnections] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [status, setStatus] = useState({ running: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshTimer = useRef(null);

  const refresh = useCallback(async () => {
    const [nextStats, nextAnalytics, nextAlerts, nextConnections, nextStatus] = await Promise.all([
      api('/connections/stats'), api('/analytics'), api('/alerts'), api('/connections?limit=100'), api('/simulation/status')
    ]);
    setStats(nextStats);
    setAnalytics(nextAnalytics);
    setAlerts(nextAlerts);
    setConnections(nextConnections);
    setStatus(nextStatus);
    setError('');
  }, []);

  useEffect(() => {
    let mounted = true;
    refresh().catch(error => mounted && setError(error.message)).finally(() => mounted && setLoading(false));
    const socket = connectSocket();
    const update = () => refresh().catch(error => mounted && setError(error.message));
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(update, 700);
    };
    socket.on('connection:new', log => {
      setConnections(current => ({ ...current, items: [log, ...current.items].slice(0, 100) }));
      scheduleRefresh();
    });
    socket.on('alert:new', alert => {
      setAlerts(current => [alert, ...current.filter(item => item._id !== alert._id)]);
      scheduleRefresh();
    });
    socket.on('dashboard:stats', payload => setStats(payload));
    socket.on('simulation:status', payload => setStatus(payload));
    socket.on('simulation:error', payload => setError(payload.message));
    socket.on('data:cleared', update);
    socket.on('connect_error', () => mounted && setError('Cannot reach the monitoring API. Check the backend and MongoDB connection.'));
    const timer = window.setInterval(() => refresh().catch(error => mounted && setError(error.message)), 15000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.clearTimeout(refreshTimer.current);
      socket.disconnect();
    };
  }, [refresh]);

  const refreshConnections = useCallback(async (query = '') => {
    setConnections(await api(`/connections?limit=100${query}`));
  }, []);

  return { stats, analytics, alerts, setAlerts, connections, refreshConnections, status, loading, error, setError, refresh };
}
