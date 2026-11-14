import mongoose from 'mongoose';

const simulationSessionSchema = new mongoose.Schema({
  running: { type: Boolean, default: false },
  mode: { type: String, enum: ['normal', 'sequential', 'random'], default: 'normal' },
  sourceIp: { type: String, required: true },
  ports: { type: [Number], default: [] },
  intervalMs: { type: Number, required: true },
  startedAt: { type: Date, default: Date.now },
  stoppedAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('SimulationSession', simulationSessionSchema);
