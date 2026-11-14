import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import api from './routes/api.js';

const app = express();
const server = http.createServer(app);

// Allowed frontend origins
const allowedOrigins = [
  'http://localhost:5173',
  'https://port-scan-detection-and-alert-system.vercel.app',
  ...(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('Blocked CORS origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Socket.io configuration
const io = new Server(server, {
  cors: corsOptions
});

app.set('io', io);

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database:
      mongoose.connection.readyState === 1
        ? 'connected'
        : 'disconnected'
  });
});

// API routes
app.use('/api', api);

// Error handling
app.use((error, _req, res, _next) => {
  console.error(error);

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      error: 'Request body must contain valid JSON.'
    });
  }

  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Origin not allowed.'
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid identifier or value.'
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Request data failed validation.'
    });
  }

  res.status(500).json({
    error: 'The request could not be completed.'
  });
});

// Socket connection
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.emit('server:ready', {
    connected: true
  });
});

// Start server and connect MongoDB
const port = Number(process.env.PORT) || 4000;

try {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log('MongoDB Connected Successfully');

  server.listen(port, () => {
    console.log(`Port Scan Detection API listening on port ${port}`);
  });

} catch (error) {
  console.error('MongoDB connection failed:', error.message);
  process.exit(1);
}