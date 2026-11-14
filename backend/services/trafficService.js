import ConnectionLog from '../models/ConnectionLog.js';
import SecurityAlert from '../models/SecurityAlert.js';
import SimulationSession from '../models/SimulationSession.js';
import { DfaDetection } from './dfaDetection.js';

const DESTINATION_IP = '10.10.0.20';
const dfa = new DfaDetection();
let active = null;

function emit(io, event, payload) {
  io.emit(event, payload);
}

export async function recordConnection({ sourceIp, destinationPort, protocol = 'TCP', status = 'ESTABLISHED' }, io) {
  const timestamp = new Date();
  const detection = dfa.process({ sourceIp, destinationPort, timestamp });
  const riskLevel = detection.severity;
  const log = await ConnectionLog.create({
    sourceIp,
    destinationIp: DESTINATION_IP,
    destinationPort,
    protocol,
    timestamp,
    status: detection.confirmed ? 'BLOCKED' : status,
    riskLevel,
    scanDetected: detection.scanDetected,
    suspicious: detection.scanDetected || detection.rapidAttempts,
    rapidAttempts: detection.rapidAttempts,
    attackType: detection.attackType,
    dfaState: detection.state,
    dfaTransitions: detection.transitions
  });

  const alerts = [];
  const confirmedNow = detection.transitions.some(transition =>
    transition.currentState === 'Q4' && transition.previousState !== 'Q4'
  );
  const possibleScanNow = detection.transitions.some(transition =>
    transition.currentState === 'Q3' && transition.previousState !== 'Q3'
  );
  if (detection.scanDetected && (confirmedNow || possibleScanNow)) {
    const alert = await SecurityAlert.create({
      sourceIp,
      detectedPorts: detection.distinctPorts,
      attackType: detection.attackType,
      severity: detection.confirmed ? 'CRITICAL' : 'HIGH',
      dfaState: detection.state,
      description: `${detection.distinctPorts.length} unique destination ports were accessed by ${sourceIp} within the 10-second detection window.`
    });
    emit(io, 'alert:new', alert);
    alerts.push(alert);
  }
  if (detection.rapidAttemptNow) {
    const alert = await SecurityAlert.create({
      sourceIp,
      detectedPorts: detection.distinctPorts,
      attackType: 'Rapid connection attempts',
      severity: 'MEDIUM',
      dfaState: detection.state,
      description: `${detection.attempts} connection attempts were recorded from ${sourceIp} within one second. This rate alert does not classify repeated-port traffic as a port scan.`
    });
    emit(io, 'alert:new', alert);
    alerts.push(alert);
  }

  emit(io, 'connection:new', log);
  const stats = await getStats();
  emit(io, 'dashboard:stats', stats);
  return { log, alerts, detection };
}

function stopTimer() {
  if (active?.timer) clearTimeout(active.timer);
  active = null;
}

export async function startSimulation(config, io) {
  await stopSimulation();
  dfa.clear();
  const session = await SimulationSession.create({
    running: true,
    mode: config.mode,
    sourceIp: config.sourceIp,
    ports: config.ports,
    intervalMs: config.intervalMs,
    startedAt: new Date()
  });
  let cursor = 0;
  let attempts = 0;
  const tick = async () => {
    if (!active || active.sessionId !== session.id) return false;
    let port;
    if (config.mode === 'random') {
      port = config.ports[Math.floor(Math.random() * config.ports.length)];
    } else {
      port = config.ports[cursor % config.ports.length];
      cursor += 1;
    }
    try {
      await recordConnection({ sourceIp: config.sourceIp, destinationPort: port, protocol: config.protocol }, io);
      if (!active || active.sessionId !== session.id) return false;
      attempts += 1;
      await SimulationSession.updateOne({ _id: session.id }, { $set: { attempts } });
      emit(io, 'simulation:status', { running: true, sessionId: session.id, attempts });
      return true;
    } catch (error) {
      if (!active || active.sessionId !== session.id) return false;
      stopTimer();
      await SimulationSession.updateOne({ _id: session.id }, { $set: { running: false, stoppedAt: new Date() } });
      emit(io, 'simulation:error', { message: 'A simulated connection could not be saved.' });
      console.error('Simulation tick failed:', error);
      return false;
    }
  };
  active = { sessionId: session.id, timer: null, config };
  const runTick = async () => {
    const succeeded = await tick();
    if (active?.sessionId === session.id) active.timer = setTimeout(runTick, config.intervalMs);
    return succeeded;
  };
  if (!await runTick()) throw new Error('The initial simulated connection could not be saved.');
  return session;
}

export async function stopSimulation() {
  if (!active) return null;
  const sessionId = active.sessionId;
  stopTimer();
  const session = await SimulationSession.findByIdAndUpdate(
    sessionId, { $set: { running: false, stoppedAt: new Date() } }, { new: true }
  );
  return session;
}

export function getSimulationStatus() {
  return active ? { running: true, sessionId: active.sessionId, mode: active.config.mode } : { running: false };
}

export function resetDetection() {
  stopTimer();
  dfa.clear();
}

export async function getStats() {
  const [totals, sources, scans, critical, normal, suspicious] = await Promise.all([
    ConnectionLog.countDocuments(),
    ConnectionLog.distinct('sourceIp'),
    ConnectionLog.countDocuments({ scanDetected: true }),
    SecurityAlert.countDocuments({ severity: 'CRITICAL', resolved: false }),
    ConnectionLog.countDocuments({ suspicious: false }),
    ConnectionLog.countDocuments({ suspicious: true })
  ]);
  return {
    totalAttempts: totals,
    uniqueSources: sources.length,
    detectedScans: scans,
    criticalAlerts: critical,
    normalConnections: normal,
    suspiciousConnections: suspicious
  };
}
