const PRODUCTION_ORIGINS = [
  'https://port-scan-detection-and-alert-syste.vercel.app',
  'https://port-scan-detection-and-alert-system.vercel.app'
];
const PREVIEW_HOST_PREFIXES = [
  'port-scan-detection-and-alert-syste-',
  'port-scan-detection-and-alert-system-'
];

function normalizeOrigin(value) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

const configuredOrigins = [
  ...(process.env.CLIENT_ORIGINS || '').split(','),
  ...(process.env.CLIENT_ORIGIN || '').split(',')
].map(normalizeOrigin).filter(Boolean);
const allowedOrigins = new Set([
  ...PRODUCTION_ORIGINS,
  'http://localhost:5173',
  ...configuredOrigins
]);

export function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser requests have no Origin header
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (allowedOrigins.has(normalized)) return true;

  try {
    const { hostname, protocol, port } = new URL(normalized);
    return protocol === 'https:' && !port && hostname.endsWith('.vercel.app') &&
      PREVIEW_HOST_PREFIXES.some(prefix => hostname.startsWith(prefix));
  } catch {
    return false;
  }
}

function originCallback(origin, callback) {
  if (isAllowedOrigin(origin)) return callback(null, true);
  console.warn('Blocked CORS origin:', origin);
  return callback(new Error('Not allowed by CORS'));
}

export const corsOptions = {
  origin: originCallback,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
