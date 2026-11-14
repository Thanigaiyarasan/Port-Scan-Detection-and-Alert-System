import { Router } from 'express';
import ConnectionLog from '../models/ConnectionLog.js';
import SecurityAlert from '../models/SecurityAlert.js';
import SimulationSession from '../models/SimulationSession.js';
import { STATES, WINDOW_MS } from '../services/dfaDetection.js';
import { isPrivateIPv4, validatePorts } from '../services/network.js';
import { getSimulationStatus, getStats, resetDetection, startSimulation, stopSimulation } from '../services/trafficService.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/connections', asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const query = {};
  if (req.query.sourceIp) {
    if (!isPrivateIPv4(String(req.query.sourceIp))) return res.status(400).json({ error: 'sourceIp must be a private IPv4 address.' });
    query.sourceIp = String(req.query.sourceIp);
  }
  if (req.query.port) {
    if (!Number.isInteger(Number(req.query.port)) || Number(req.query.port) < 1 || Number(req.query.port) > 65535) {
      return res.status(400).json({ error: 'port must be an integer from 1 to 65535.' });
    }
    query.destinationPort = Number(req.query.port);
  }
  if (req.query.status) {
    const status = String(req.query.status).toUpperCase();
    if (!['ESTABLISHED', 'BLOCKED', 'TIMEOUT'].includes(status)) return res.status(400).json({ error: 'Invalid connection status filter.' });
    query.status = status;
  }
  const [items, total] = await Promise.all([
    ConnectionLog.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ConnectionLog.countDocuments(query)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

router.get('/connections/stats', asyncRoute(async (_req, res) => res.json(await getStats())));
router.get('/alerts', asyncRoute(async (req, res) => {
  const query = {};
  if (req.query.severity) query.severity = String(req.query.severity).toUpperCase();
  if (req.query.resolved !== undefined) query.resolved = req.query.resolved === 'true';
  if (req.query.search) query.$or = [
    { sourceIp: { $regex: escapeRegex(String(req.query.search).slice(0, 100)), $options: 'i' } },
    { attackType: { $regex: escapeRegex(String(req.query.search).slice(0, 100)), $options: 'i' } },
    { description: { $regex: escapeRegex(String(req.query.search).slice(0, 100)), $options: 'i' } }
  ];
  res.json(await SecurityAlert.find(query).sort({ timestamp: -1 }).limit(200).lean());
}));
router.post('/alerts', asyncRoute(async (req, res) => {
  const { sourceIp, detectedPorts, attackType, severity, dfaState, description } = req.body;
  if (!isPrivateIPv4(sourceIp) || !validatePorts(detectedPorts) || !attackType || !description ||
      !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) || !STATES.includes(dfaState)) {
    return res.status(400).json({ error: 'Invalid alert data. Use a private IPv4 source and valid ports, severity, and DFA state.' });
  }
  res.status(201).json(await SecurityAlert.create({ sourceIp, detectedPorts, attackType, severity, dfaState, description }));
}));
router.put('/alerts/:id', asyncRoute(async (req, res) => {
  if (typeof req.body.resolved !== 'boolean') return res.status(400).json({ error: 'resolved must be a boolean.' });
  const alert = await SecurityAlert.findByIdAndUpdate(req.params.id, { $set: { resolved: req.body.resolved } }, { new: true, runValidators: true });
  if (!alert) return res.status(404).json({ error: 'Alert not found.' });
  res.json(alert);
}));
router.delete('/alerts/:id', asyncRoute(async (req, res) => {
  const alert = await SecurityAlert.findByIdAndDelete(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found.' });
  res.status(204).end();
}));

router.post('/simulation/start', asyncRoute(async (req, res) => {
  const { mode, sourceIp, ports, intervalMs = 500, protocol = 'TCP' } = req.body;
  if (!['normal', 'sequential', 'random'].includes(mode) || !isPrivateIPv4(sourceIp) ||
      !validatePorts(ports) || !Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 5000 ||
      !['TCP', 'UDP'].includes(protocol)) {
    return res.status(400).json({ error: 'Invalid simulation settings. Use a private IPv4 address, ports 1–65535 and an interval from 100–5000 ms.' });
  }
  if (mode === 'normal' && ports.length > 1) {
    return res.status(400).json({ error: 'Normal traffic mode accepts exactly one destination port.' });
  }
  const session = await startSimulation({ mode, sourceIp, ports: ports.map(Number), intervalMs, protocol }, req.app.get('io'));
  res.status(201).json({ session, status: getSimulationStatus() });
}));
router.post('/simulation/stop', asyncRoute(async (req, res) => {
  const session = await stopSimulation();
  req.app.get('io').emit('simulation:status', getSimulationStatus());
  res.json({ stopped: Boolean(session), session });
}));
router.get('/simulation/status', (_req, res) => res.json(getSimulationStatus()));
router.delete('/simulation/data', asyncRoute(async (req, res) => {
  await stopSimulation();
  resetDetection();
  await Promise.all([ConnectionLog.deleteMany({}), SecurityAlert.deleteMany({}), SimulationSession.deleteMany({})]);
  req.app.get('io').emit('data:cleared');
  req.app.get('io').emit('dashboard:stats', await getStats());
  req.app.get('io').emit('simulation:status', getSimulationStatus());
  res.json({ cleared: true });
}));
router.get('/dfa/states', (_req, res) => res.json({
  states: STATES.map((id, index) => ({ id, label: ['Initial', 'First attempt', 'Multiple ports', 'Rapid scan', 'Confirmed scan'][index] })),
  alphabet: ['new_port', 'repeated_port', 'connection_timeout'],
  rules: { possibleScanDistinctPorts: 5, confirmedScanDistinctPorts: 10, windowMs: WINDOW_MS }
}));
router.get('/analytics', asyncRoute(async (_req, res) => {
  const [byPort, bySource, recent] = await Promise.all([
    ConnectionLog.aggregate([{ $group: { _id: '$destinationPort', count: { $sum: 1 }, suspicious: { $sum: { $cond: ['$suspicious', 1, 0] } } } }, { $sort: { count: -1 } }, { $limit: 12 }]),
    ConnectionLog.aggregate([{ $match: { suspicious: true } }, { $group: { _id: '$sourceIp', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 6 }]),
    ConnectionLog.find().sort({ timestamp: -1 }).limit(1000).select('timestamp suspicious').lean()
  ]);
  const buckets = new Map();
  for (const log of recent) {
    const key = new Date(log.timestamp).toISOString().slice(11, 16);
    const bucket = buckets.get(key) || { time: key, normal: 0, suspicious: 0 };
    bucket[log.suspicious ? 'suspicious' : 'normal'] += 1;
    buckets.set(key, bucket);
  }
  res.json({
    byPort: byPort.map(item => ({ port: String(item._id), attempts: item.count, suspicious: item.suspicious })),
    bySource: bySource.map(item => ({ ip: item._id, attempts: item.count })),
    timeline: [...buckets.values()].reverse(),
    sessions: await SimulationSession.find().sort({ startedAt: -1 }).limit(10).lean()
  });
}));

export default router;
