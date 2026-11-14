import mongoose from 'mongoose';

const transitionSchema = new mongoose.Schema({
  previousState: { type: String, required: true },
  inputSymbol: { type: String, enum: ['new_port', 'repeated_port', 'connection_timeout'], required: true },
  currentState: { type: String, required: true },
  timestamp: { type: Date, required: true }
}, { _id: false });

const connectionLogSchema = new mongoose.Schema({
  sourceIp: { type: String, required: true, index: true },
  destinationIp: { type: String, required: true },
  destinationPort: { type: Number, required: true },
  protocol: { type: String, enum: ['TCP', 'UDP'], default: 'TCP' },
  timestamp: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['ESTABLISHED', 'BLOCKED', 'TIMEOUT'], required: true },
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
  scanDetected: { type: Boolean, default: false },
  suspicious: { type: Boolean, default: false },
  rapidAttempts: { type: Boolean, default: false },
  attackType: { type: String, default: null },
  dfaState: { type: String, enum: ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'], required: true },
  dfaTransitions: { type: [transitionSchema], default: [] }
});

export default mongoose.model('ConnectionLog', connectionLogSchema);
