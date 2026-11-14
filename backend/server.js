import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import api from './routes/api.js';

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const io = new Server(server, { cors: { origin: allowedOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE'] } });

app.set('io', io);
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.use('/api', api);
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid identifier or value.' });
  if (error.name === 'ValidationError') return res.status(400).json({ error: 'Request data failed validation.' });
  res.status(500).json({ error: 'The request could not be completed.' });
});

io.on('connection', socket => {
  socket.emit('server:ready', { connected: true });
});

const port = Number(process.env.PORT) || 4000;
try {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/port_scan_detection');
  server.listen(port, () => console.log(`Port Scan Detection API listening on http://localhost:${port}`));
} catch (error) {
  console.error('MongoDB connection failed. Check MONGODB_URI and ensure MongoDB is running.', error.message);
  process.exitCode = 1;
}
