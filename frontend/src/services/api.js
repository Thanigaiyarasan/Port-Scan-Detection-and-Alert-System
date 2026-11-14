import { io } from 'socket.io-client';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export function connectSocket() {
  return io(API_URL, { reconnectionAttempts: 5, timeout: 5000 });
}

export function formatTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}
