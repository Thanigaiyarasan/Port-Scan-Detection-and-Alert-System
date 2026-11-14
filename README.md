# Port Scan Detection and Alert System

Sentinel is a local educational security-operations dashboard for generating and analyzing **simulated** network connection attempts. A JavaScript deterministic finite automaton (DFA) tracks unique destination ports independently for each source IP and classifies scan-like patterns. It never opens sockets to destination addresses or performs scans against real systems.

## Problem statement

Port scans can be an early indicator of service discovery or reconnaissance. This project demonstrates how connection events can be monitored, grouped by source, and classified against transparent, time-bounded rules. Its traffic generator is deliberately isolated from real networking so it can be used safely for learning and demonstrations.

## Objectives

- Generate repeatable normal, sequential-scan, and randomized-scan traffic.
- Demonstrate a working, per-source DFA with a rolling inactivity reset.
- Persist connection records, transitions, alerts, and simulation sessions in MongoDB.
- Show live activity, metrics, analytics, and alert management in a responsive SOC dashboard.
- Provide searchable connection and alert views, filtering, and CSV export.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, Recharts, Lucide React, Socket.IO client |
| Backend | Node.js (ES modules), Express, Socket.IO |
| Persistence | MongoDB, Mongoose |
| Detection | JavaScript finite automaton |
| Tests | Node.js built-in test runner |

## System architecture

```text
React dashboard (localhost:5173)
        │ REST + Socket.IO
        ▼
Express API / simulator (localhost:4000)
        ├── DFA detection, maintained separately for each source IP
        ├── Simulation generator (creates data; does not open network sockets)
        ├── Socket.IO dashboard events
        └── Mongoose models ── MongoDB (port_scan_detection)
```

Generated destination addresses use the reserved private simulation address `10.10.0.20`. Simulator source addresses are private IPv4 addresses. Source IP and port inputs are validated by the API.

## DFA explanation

The DFA is implemented in `backend/services/dfaDetection.js`. It keeps an independent state and set of unique destination ports for every source IP. The 10-second window starts with that source's first attempt. A later event at or after the window boundary first records a timeout transition to Q0, then processes the new event in the fresh window.

### States

| State | Meaning |
| --- | --- |
| Q0 | Initial state; no connection in the current window |
| Q1 | First unique destination port observed |
| Q2 | 2–4 unique destination ports observed |
| Q3 | Possible scan: 5–9 unique ports in the current window |
| Q4 | Confirmed scan: 10 or more unique ports in the current window |

### Input alphabet and state transition rules

| Current state | Input / condition | Next state |
| --- | --- | --- |
| Q0 | `new_port` (first unique port) | Q1 |
| Q1 | `new_port` (second unique port) | Q2 |
| Q2 | `new_port`, fewer than 5 unique ports | Q2 |
| Q2 | `new_port` reaches 5 unique ports | Q3 |
| Q3 | `new_port`, fewer than 10 unique ports | Q3 |
| Q3 | `new_port` reaches 10 unique ports | Q4 |
| Any | `repeated_port` | Remain in the current state |
| Any | `connection_timeout` after 10 seconds | Q0 |

The state is determined by the number of **distinct** ports, not raw attempt count or speed alone. Repeated attempts to one port cannot cause a port-scan classification. Ten or more attempts within one second create a separate MEDIUM `Rapid connection attempts` alert; that rate alert does not change the DFA's scan state. An increasing sequence of at least five distinct ports is labeled `Sequential port scan`; other scan patterns are labeled `Multiple port scan`. Each connection record stores the transition(s) processed for that event, including previous state, input symbol, current state, and timestamp. Q3 creates a HIGH alert; first entry into Q4 creates a CRITICAL alert. Alerts are not duplicated on subsequent Q4 events in the same window.

## Installation

Prerequisites: Node.js 20+ (Node.js 18.18+ should also work), npm, and MongoDB Community Server or a MongoDB Atlas connection string.

1. Start MongoDB locally, or provision an Atlas database.
2. In `backend`, copy `.env.example` to `.env` and set `MONGODB_URI` to your connection string. The default local URI is `mongodb://127.0.0.1:27017/port_scan_detection`.
3. Install dependencies:

   ```powershell
   cd backend
   npm install
   cd ..\frontend
   npm install
   ```

4. If the frontend is not using `http://localhost:4000`, create `frontend\.env` and set `VITE_API_URL` to the backend origin. The default requires no frontend environment file.

## Run

Open two terminals from the project root.

**Backend**

```powershell
cd backend
npm run dev
```

**Frontend**

```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173**. The API health check is at **http://localhost:4000/api/health**. The backend exits with an explicit MongoDB connection error if the database is unavailable.

## Using the application

1. Choose a traffic profile, private source IP, destination ports, and interval on the Overview page.
2. Start a simulation. Normal mode generates repeated attempts to a single port; sequential and random modes iterate or select from the supplied port list.
3. Watch connection metrics, DFA state transitions, port charts, and automatically generated alerts update live.
4. Inspect the connection monitor and alert queue; resolve/delete alerts or export connection rows to CSV.
5. The Port Analysis page shows common service ports as open in the **simulation model** and unknown services as closed; these are illustrative statuses, not real probes.
6. Use Clear data to stop the active simulation and remove all persisted logs, alerts, and sessions. This requires confirmation.

## REST API

The API base URL is `http://localhost:4000/api`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | API and MongoDB readiness |
| GET | `/connections?page=1&limit=50&sourceIp=&port=&status=` | Paginated, filterable connection records |
| GET | `/connections/stats` | Live connection and alert summary counts |
| GET | `/alerts?severity=&resolved=&search=` | Query the alert queue |
| POST | `/alerts` | Create a validated alert |
| PUT | `/alerts/:id` | Update the alert's `resolved` boolean |
| DELETE | `/alerts/:id` | Delete an alert |
| POST | `/simulation/start` | Start a local simulation |
| POST | `/simulation/stop` | Stop the active simulation |
| GET | `/simulation/status` | Read current simulator status |
| DELETE | `/simulation/data` | Stop simulation and clear persisted simulation data |
| GET | `/dfa/states` | Read DFA states, alphabet, and thresholds |
| GET | `/analytics` | Port, source, timeline, and recent-session analytics |

Example simulation request:

```json
{
  "mode": "sequential",
  "sourceIp": "192.168.1.10",
  "ports": [21, 22, 23, 80, 443, 8080],
  "intervalMs": 400,
  "protocol": "TCP"
}
```

Valid `mode` values are `normal`, `sequential`, and `random`. Normal mode requires exactly one port. The interval is limited to 100–5000 ms, the port range is 1–65535, and source IPs must be private IPv4 addresses. Socket.IO events include `connection:new`, `alert:new`, `dashboard:stats`, `simulation:status`, and `simulation:error`.

## Data models

- `ConnectionLog`: source/destination, port, protocol, timestamp, status, risk, detection result, DFA state, and transition history.
- `SecurityAlert`: source, detected ports, attack type, severity, DFA state, description, resolution state, and timestamps.
- `SimulationSession`: profile, source, ports, interval, start/stop times, and attempt count.

## Testing

Run the DFA tests:

```powershell
cd backend
npm test
```

Build the frontend:

```powershell
cd frontend
npm run build
```

End-to-end API and live simulation testing requires a running MongoDB instance and both app processes. Verify the API with `Invoke-RestMethod http://localhost:4000/api/health`, then generate traffic from the dashboard and check `/api/connections`, `/api/connections/stats`, `/api/alerts`, and `/api/analytics`.

## Screenshots

Screenshots can be added here after running the application locally.

## Future enhancements

- Add configurable DFA windows and alert policies with audited settings.
- Add retention policies and indexed time-series aggregation for large datasets.
- Add user authentication and role-based alert workflows for a multi-user deployment.
- Add reproducible scenario presets and downloadable simulation reports.
- Add automated integration tests against an ephemeral MongoDB test instance.

## Safety note

This application is an educational simulator, not a network scanner. Simulation code only creates database records and Socket.IO updates; it does not send probes or connect to external systems.
