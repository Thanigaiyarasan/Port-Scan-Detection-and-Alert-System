import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import api from './routes/api.js';
import { corsOptions } from './services/cors.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });
app.set('io', io);

app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: 'ok',
    database: connected ? 'connected' : 'disconnected'
  });
});

app.use('/api', api);
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid identifier or value.' });
  if (error.name === 'ValidationError') return res.status(400).json({ error: 'Request data failed validation.' });
  if (mongoose.connection.readyState !== 1 || error.name === 'MongoServerSelectionError') {
    return res.status(503).json({ error: 'Database is temporarily unavailable.' });
  }
  console.error('Request failed:', error.message);
  return res.status(500).json({ error: 'The request could not be completed.' });
});

io.on('connection', socket => {
  console.log('Socket client connected:', socket.id);
  socket.emit('server:ready', { connected: true });
  socket.on('disconnect', reason => console.log('Socket client disconnected:', reason));
});

const port = Number(process.env.PORT) || 4000;
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) console.error('MONGODB_URI is not configured; database-backed requests will be unavailable.');
mongoose.set('bufferCommands', false);
mongoose.connection.on('connected', () => console.log('MongoDB connected.'));
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected.'));
mongoose.connection.on('error', error => console.error('MongoDB connection error:', error.message));

server.listen(port, () => console.log(`Port Scan Detection API listening on port ${port}`));

if (mongoUri) {
  const connectToDatabase = () => mongoose.connect(mongoUri).catch(error => {
    console.error('MongoDB connection failed; retrying in 10 seconds:', error.message);
    const retry = setTimeout(connectToDatabase, 10_000);
    retry.unref();
  });
  connectToDatabase();
}
