import { io } from 'socket.io-client';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error('VITE_API_URL must be set for production builds.');
}

const defaultApiUrl = import.meta.env.DEV ? 'http://localhost:4000' : 'https://port-scan-detection-backend.onrender.com';
export const API_URL = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, '').replace(/\/api$/i, '');

export async function api(path, options = {}) {
  const normalizedPath = `/${String(path).replace(/^\/+/, '')}`.replace(/^\/api(?=\/|$)/i, '');
  let response;
  try {
    response = await fetch(`${API_URL}/api${normalizedPath}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the monitoring API. Check the backend URL and network connection.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export function connectSocket() {
  return io(API_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000
  });
}

export function formatTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}
