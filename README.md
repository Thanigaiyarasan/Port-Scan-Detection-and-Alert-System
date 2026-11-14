# Sentinel — Port Scan Detection and Alert System

Sentinel is an educational MERN application for monitoring **simulated** connection traffic. A backend DFA analyzes each simulated source IP, saves connection logs and security alerts to MongoDB Atlas, and publishes live updates through Socket.IO. The simulator creates records; it does not open sockets or scan external hosts.

## Architecture

- **MongoDB Atlas** stores connection logs, security alerts, and simulation sessions.
- **Express and Node.js** expose the REST API and health check.
- **Mongoose** defines the data models and performs database operations.
- **Socket.IO** sends connection, alert, dashboard-stat, and simulation-status events.
- **React and Vite** provide the Sentinel operations dashboard.

```text
backend/
  models/       ConnectionLog, SecurityAlert, SimulationSession
  routes/api.js REST endpoints and request validation
  services/     DFA, simulated traffic, network validation, CORS rules
  server.js     Express, Socket.IO, MongoDB startup, health endpoint
frontend/
  src/components/  Dashboard components
  src/hooks/       Monitoring state and Socket.IO event handling
  src/services/    Central API and Socket.IO client configuration
  src/App.jsx      Dashboard pages and simulation controls
  vite.config.js   Vite build configuration
  vercel.json      SPA route fallback
render.yaml        Render backend service blueprint
```

## Requirements

- Node.js 20 or newer and npm
- A MongoDB Atlas cluster and database user
- Git for deployment

## Local development

In the backend folder, create a local environment file from the example and add your Atlas connection URI:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

In a second terminal, run the frontend:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open the Vite URL printed in the frontend terminal (normally `http://localhost:5173`). The frontend development default points at `http://localhost:4000`; set `VITE_API_URL` in `frontend/.env` if your backend uses another address. The backend reads `PORT` and defaults to `4000` locally.

Actual `.env` files are ignored by Git. Keep database URIs and all credentials in those local files or deployment environment settings, never in source code or commits.

## MongoDB Atlas setup

1. Create an Atlas cluster and a database user with access to the Sentinel database.
2. Copy the application connection string and replace its password/database placeholders locally. URL-encode special characters in the password.
3. Add the deployment's outbound IP addresses to Atlas Network Access where available. If the host does not provide stable outbound addresses, use an Atlas network policy appropriate to your organization; avoid exposing the cluster more broadly than necessary.
4. Set `MONGODB_URI` in the backend environment. Do not put it in the frontend or expose it in logs.
5. Check `GET /api/health`. It returns HTTP 200 with `{"status":"ok","database":"connected"}` once connected, and HTTP 503 with `database: "disconnected"` if the database is not connected.

## Environment variables

### Backend

Set these in `backend/.env` locally and in Render's service environment:

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Private MongoDB Atlas connection string. |
| `PORT` | Render supplies it | Local default is `4000`; the server honors the platform-provided port. |
| `CLIENT_ORIGINS` | Recommended | Comma-separated frontend origins. Include the production Vercel origin and any additional trusted origins. |
| `CLIENT_ORIGIN` | Optional legacy setting | Also accepted for compatibility; `CLIENT_ORIGINS` is preferred. |

`backend/.env.example` provides safe placeholders. The production Vercel origin and `http://localhost:5173` are supported by the CORS policy. Project preview hosts with the `port-scan-detection-and-alert-system-` prefix on `vercel.app` are also allowed. Keep any configured origin list restricted to trusted applications.

### Frontend

Set `VITE_API_URL` to the backend origin, without a trailing `/api`:

```text
VITE_API_URL=https://port-scan-detection-backend.onrender.com
```

Use this value in Vercel's project environment settings. `frontend/.env.example` contains the current Render URL. Production builds fail early if `VITE_API_URL` is missing; local Vite development defaults to localhost.

## API endpoints

All routes below are prefixed by `/api`. JSON request bodies are expected where noted.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API and MongoDB connection status. |
| `GET` | `/connections` | MongoDB-paginated connection records; supports `page`, `limit`, `search`, `sourceIp`, `port`, and `status` filters. |
| `GET` | `/connections/stats` | Dashboard totals, unique sources, scans, and risk counts. |
| `GET` | `/alerts` | Alert list; supports `severity`, `resolved`, and `search` filters. |
| `POST` | `/alerts` | Create a validated alert. |
| `PUT` | `/alerts/:id` | Change an alert's `resolved` boolean. |
| `DELETE` | `/alerts/:id` | Delete an alert. |
| `POST` | `/simulation/start` | Start safe simulated traffic. Body: `mode`, private `sourceIp`, `ports`, optional `intervalMs` and `protocol`. |
| `POST` | `/simulation/stop` | Stop the active simulation. |
| `GET` | `/simulation/status` | Get the active simulation status. |
| `DELETE` | `/simulation/data` | Stop simulation and clear stored logs, alerts, and sessions. |
| `GET` | `/dfa/states` | DFA states, input alphabet, and detection thresholds. |
| `GET` | `/analytics` | Port/source aggregates, recent timeline, and sessions. |

The simulator only accepts RFC1918 private IPv4 source addresses and ports from 1 through 65535. It writes simulated connection records to MongoDB and emits Socket.IO events; it does not attempt real network connections.

## DFA behavior

Each source IP has a separate 10-second activity window. A unique destination port advances the state; a repeated port leaves the scan state unchanged. When the next attempt arrives after the window expires, the DFA records a timeout transition to `Q0` before processing that attempt.

| State | Meaning | Acceptance behavior |
| --- | --- | --- |
| `Q0` | No ports observed in the current window | Initial or expired state. |
| `Q1` | One distinct port | Normal single-service activity. |
| `Q2` | Two through four distinct ports | Not yet a scan alert. |
| `Q3` | Five through nine distinct ports | Possible scan; a HIGH alert is generated on entry. |
| `Q4` | Ten or more distinct ports | Confirmed scan; a CRITICAL alert is generated on entry. |

Input symbols are `new_port`, `repeated_port`, and `connection_timeout`. Ten attempts within one second also generate a separate MEDIUM rapid-attempt alert; repeated attempts to one port do not count as a multi-port scan. Port order is labeled sequential when each unique port increases, otherwise the detected pattern is multiple-port.

## Real-time events

The frontend opens a Socket.IO connection to `VITE_API_URL` and reconnects automatically. The backend emits `connection:new`, `alert:new`, `dashboard:stats`, `simulation:status`, `simulation:error`, and `data:cleared`. The same origin policy is applied to Express CORS and Socket.IO CORS.

## Tests and production build

Run backend unit tests:

```powershell
cd backend
npm test
```

Build the frontend:

```powershell
cd frontend
npm run build
```

The backend tests cover CORS origin rules, private address/port validation, and DFA transitions and thresholds. The frontend currently has no separate unit-test script; its production Vite build verifies module resolution and bundling. A real Atlas connection, deployed CORS behavior, Socket.IO connectivity, and saved dashboard data require configured credentials and a live deployment; a successful local build does not verify those external services.

## Deploy backend to Render

The repository includes `render.yaml`. Create a Render Blueprint from the repository or configure the service manually:

- Root directory: `backend`
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Environment: `NODE_ENV=production`, `MONGODB_URI` (secret), and `CLIENT_ORIGINS`

Render supplies `PORT`; do not hardcode a production port. Set `CLIENT_ORIGINS` to `https://port-scan-detection-and-alert-system.vercel.app` and any other trusted deployed frontend origins. Deploy the backend and confirm its health endpoint reports `database: "connected"` before deploying the frontend.

## Deploy frontend to Vercel

Create/import the Vercel project from the same repository and set:

- Root directory: `frontend`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_URL=https://port-scan-detection-backend.onrender.com`

The `frontend/vercel.json` rewrite supports SPA refreshes. Add the production Vercel origin to Render's `CLIENT_ORIGINS` if it is not already present. Preview deployments following the project host prefix are supported by the backend CORS rule.

## Common deployment problems

- **Health reports disconnected / 503:** Check `MONGODB_URI`, Atlas database-user credentials, Atlas IP access rules, and the Render service logs. Rotate any credential that was accidentally exposed.
- **Browser reports a CORS error:** Check the page's exact origin and add it to Render `CLIENT_ORIGINS` as a comma-separated origin (scheme and host, no path). Redeploy the backend after changing it.
- **Dashboard says API offline:** Check that `VITE_API_URL` is set in the Vercel environment for the active deployment and points to the Render service origin without `/api`. Trigger a new frontend deployment after changing a Vite variable.
- **Vercel route refresh returns 404:** Confirm Vercel's root directory is `frontend` and `frontend/vercel.json` is included in the deployment.
- **Socket.IO cannot connect:** Confirm the backend is running, the Render origin is reachable, and its CORS allowlist includes the frontend origin. REST API availability and Socket.IO connectivity are separate checks.
- **No connection data appears:** Start the dashboard's simulated traffic and verify MongoDB connectivity. The app intentionally does not generate traffic against external systems.

## Security notes

- Never commit `.env` files, database credentials, or production secrets. `.gitignore` excludes `.env` and `.env.*` while allowing the safe `.env.example` files.
- Treat simulation controls and alert mutation endpoints as an educational/demo service. Add authentication and authorization before exposing administrative actions to untrusted users.
- Traffic generation remains simulated and restricted to private source IP inputs; the app does not scan external systems.
