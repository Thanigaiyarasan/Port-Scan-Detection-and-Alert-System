import mongoose from 'mongoose';

const securityAlertSchema = new mongoose.Schema({
  sourceIp: { type: String, required: true, index: true },
  detectedPorts: { type: [Number], default: [] },
  attackType: { type: String, required: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
  dfaState: { type: String, enum: ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'], required: true },
  description: { type: String, required: true },
  resolved: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

export default mongoose.model('SecurityAlert', securityAlertSchema);
