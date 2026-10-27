# Flock Energy — Urja Meter Ops API Wrapper

[![Tests](https://img.shields.io/badge/Tests-44%20Passing-brightgreen.svg)]()
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.3-blue.svg)](./openapi.json)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)]()
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)]()

A production-minded, resilient REST API wrapper built on Node.js and Express that programmatically exposes smart-meter listings, detailed nameplate attributes, live geolocations, 30-minute interval consumption history, and electrical distribution network hierarchies from the legacy **Urja Meter Ops** portal (`https://urja-ops.flockenergy.tech`).

---

## 📑 Table of Contents

- [Overview & Objective](#overview--objective)
- [Key Features](#key-features)
- [Architecture & Request Flow](#architecture--request-flow)
- [Project Structure](#project-structure)
- [Prerequisites & Installation](#prerequisites--installation)
- [Configuration & Environment](#configuration--environment)
- [Running the Application](#running-the-application)
- [Running Automated Tests](#running-automated-tests)
- [Interactive Documentation & OpenAPI](#interactive-documentation--openapi)
- [API Endpoints & Curl Examples](#api-endpoints--curl-examples)
- [Security & Production Hardening](#security--production-hardening)
- [Assumptions, Trade-Offs & Omissions](#assumptions-trade-offs--omissions)
- [Deliverables & Core Links](#deliverables--core-links)

---

## Overview & Objective

Flock works with electricity distribution utilities. One utility uses an internal legacy web portal — **Urja Meter Ops** — to inspect smart meters, transformers, and consumption. The portal was designed strictly for manual human navigation in a web browser and provides no public API.

This service acts as an abstraction layer between downstream consumers (product, data science, SCADA dashboards) and the legacy portal. It handles upstream authentication, cookie jar session persistence, concurrency locks, HTML parsing, HMAC request signing, data normalization, and defensive error handling.

---

## Key Features

1. **Automated Session Lifecycle & Concurrency Locking**:
   - Reuses authenticated session tokens (`__Secure-better-auth.session_token`).
   - Uses an asynchronous mutex lock (`loginPromise`) so simultaneous downstream requests share a single upstream login attempt.
   - Automatically re-authenticates and retries on session expiration (detecting 401 status, redirects, or login HTML).
2. **Reverse-Engineered Portal Integration**:
   - Direct consumption of upstream JSON search endpoints (`/portal/meters/search`).
   - Direct extraction of GPS coordinates (`/portal/meters/:id/geo`) and energy telemetry (`/portal/meters/:id/energy`).
   - HTML DOM parsing with Cheerio for server-rendered meter nameplates and hierarchy breadcrumbs.
   - HMAC-SHA256 signature generation for authenticated bulk exports (`/portal/export`).
3. **Data Normalization Pipeline**:
   - Numeric string to float parsing without precision loss.
   - Preserves meter identifiers and DT codes as strings (respecting potential leading zeroes).
   - Standardizes statuses into canonical uppercase enums (`INSTALLED`, `DECOMMISSIONED`, `FAULTY`).
   - Parses legacy Indian local timestamps (`DD/MM/YYYY HH:mm`) into ISO 8601 UTC strings without timezone distortion.
4. **Defensive Error Handling & Security**:
   - Strict Zod schema validation on path and query parameters.
   - Centralized error handler returning uniform error envelopes.
   - Sanitizes error messages to guarantee credentials, passwords, session tokens, and stack traces are never leaked.
   - Configurable downstream API key access control (`x-api-key`) and IP rate limiting.
5. **Interactive OpenAPI 3.x Documentation**:
   - Authoritative OpenAPI 3.0.3 specification at `/openapi.json`.
   - Rendered interactive Swagger UI at `/docs`.

---

## Architecture & Request Flow

```mermaid
flowchart TD
    Client(["API Consumer (App / CLI / Frontend)"])

    subgraph Wrapper ["Flock Energy API Wrapper (Port 3000)"]
        direction TB
        RL["Rate Limiter & Helmet"]
        AuthMid["API Key Auth (x-api-key)"]
        Router["Express Router (/api/v1)"]
        Zod["Zod Parameter Validation"]
        Service["Meter Service (meterService.js)"]
        Normalizer["Data Normalizer (normalize.js)"]
        ErrMid["Centralized Error Handler"]

        subgraph ClientLayer ["Urja Client (urjaClient.js)"]
            Mutex["Login Concurrency Mutex"]
            Jar[("ToughCookie Jar")]
            Axios["Axios HTTP + Interceptors"]
            Retry["Auto-Reauth & Single Retry"]
        end
    end

    subgraph Upstream ["Legacy Urja Meter Ops (urja-ops.flockenergy.tech)"]
        LoginEP["POST /login (SvelteKit Form Action)"]
        SearchEP["GET /portal/meters/search"]
        HtmlEP["GET /meters/:id (SSR HTML)"]
        GeoEP["GET /portal/meters/:id/geo"]
        EnergyEP["GET /portal/meters/:id/energy"]
        ExportEP["GET /portal/export (HMAC Signed)"]
    end

    Client -->|HTTP Request| RL
    RL --> AuthMid
    AuthMid --> Router
    Router --> Zod
    Zod --> Service
    Service --> ClientLayer

    ClientLayer -->|1. Authenticate with Origin Header| LoginEP
    ClientLayer -->|2. Search Meters| SearchEP
    ClientLayer -->|3. Fetch Nameplate HTML| HtmlEP
    ClientLayer -->|4. Fetch GPS Coordinates| GeoEP
    ClientLayer -->|5. Fetch Energy Readings| EnergyEP
    ClientLayer -->|6. Fetch Network Hierarchy| ExportEP

    Upstream -->|Raw Data / HTML / Cookies| ClientLayer
    ClientLayer --> Normalizer
    Normalizer --> Service
    Service --> Router
    Router --> Client

    Zod -.->|Validation Error (400)| ErrMid
    ClientLayer -.->|Upstream Error (502/504)| ErrMid
    ErrMid -.->|Sanitized JSON Error| Client
```

---

## Project Structure

```text
flock-energy-api/
├── docs/
│   └── openapi.yaml           # OpenAPI 3.0.3 YAML definition
├── scripts/
│   └── verify-live.js         # Live upstream integration verification script
├── src/
│   ├── app.js                 # Express application initialization & middleware stack
│   ├── server.js              # HTTP server listener & graceful shutdown handlers
│   ├── config/
│   │   └── env.js             # Zod environment variable parsing & validation
│   ├── clients/
│   │   └── urjaClient.js      # Upstream HTTP client, cookie jar, CSRF, & re-auth logic
│   ├── services/
│   │   └── meterService.js    # Business logic, Cheerio HTML parsing, & cache manager
│   ├── routes/
│   │   ├── health.js          # Health check endpoint (/health)
│   │   ├── meters.js          # Smart-meter listing, detail, & consumption routes
│   │   └── hierarchy.js       # Distribution network hierarchy routes
│   ├── middleware/
│   │   ├── auth.js            # Wrapper API key access control middleware
│   │   ├── errorHandler.js    # Centralized error handler & credential sanitizer
│   │   └── validate.js        # Zod request validation middleware factory
│   └── utils/
│       └── normalize.js       # Pure normalization & data parsing functions
├── tests/
│   ├── unit/
│   │   ├── env.test.js        # Environment schema tests
│   │   ├── normalize.test.js  # Normalization & parsing unit tests
│   │   ├── urjaClient.test.js # Authentication, concurrency, & retry tests
│   │   └── meterService.test.js # Service layer & Cheerio extraction tests
│   └── integration/
│       ├── health.test.js     # Health endpoint integration tests
│       ├── docs.test.js       # Swagger UI & OpenAPI spec tests
│       ├── meters.test.js     # Meter routes integration tests
│       ├── hierarchy.test.js  # Hierarchy routes integration tests
│       └── auth_errors.test.js # Error mapping & credential leakage tests
├── .env.example               # Example environment configuration template
├── .gitignore                 # Git ignore rules (protects credentials and cookies)
├── openapi.json               # Generated OpenAPI 3.0.3 specification in JSON format
├── package.json               # Node.js project manifest & scripts
├── PROTOCOL.md                # Detailed reverse engineering discovery protocol
├── REFLECTION.md              # Honest technical self-evaluation and reflection
└── README.md                  # Main project documentation
```

---

## Prerequisites & Installation

### Prerequisites
- **Node.js**: `v18.0.0` or higher (`v22.x` recommended)
- **npm**: `v9.0.0` or higher

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/flock-energy-api.git
   cd flock-energy-api
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

---

## Configuration & Environment

Copy the `.env.example` file to create your local `.env`:
```bash
cp .env.example .env
```

Configure your environment variables:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | `3000` | Port for the wrapper HTTP server |
| `NODE_ENV` | Optional | `development` | Environment (`development`, `test`, `production`) |
| `URJA_BASE_URL` | Required | `https://urja-ops.flockenergy.tech` | Upstream portal base URL |
| `URJA_USERNAME` | Required | `operator@urja.local` | Upstream login username |
| `URJA_PASSWORD` | Required | `urja-ops-2026` | Upstream login password |
| `UPSTREAM_TIMEOUT_MS` | Optional | `10000` | Upstream request timeout in milliseconds |
| `API_KEY` | Optional | `""` (empty) | If set, enforces `x-api-key` header on `/api/v1/*` routes |
| `RATE_LIMIT_WINDOW_MS`| Optional | `900000` (15 min) | Rate limit tracking window |
| `RATE_LIMIT_MAX` | Optional | `500` | Max requests per IP within the tracking window |

> [!IMPORTANT]
> The real `.env` file contains credentials and is strictly ignored in `.gitignore`. Never commit `.env` or credentials to Git.

---

## Running the Application

### Development Mode (with file watcher):
```bash
npm run dev
```

### Production Start:
```bash
npm start
```

Upon starting, the server logs startup diagnostics:
```text
=======================================================
🚀 Flock Energy API Wrapper running on port 3000
📡 Upstream Portal : https://urja-ops.flockenergy.tech
📖 Interactive Docs: http://localhost:3000/docs
📑 OpenAPI JSON    : http://localhost:3000/openapi.json
🩺 Health Check    : http://localhost:3000/health
⚡ Environment     : development
=======================================================
```

---

## Running Automated Tests

The test suite is built with **Vitest** and **Supertest**. It includes **44 automated tests** across 9 test suites covering environment validation, unit transformation logic, authentication states, concurrency locks, route integration, and error mappings.

All unit and integration tests use isolated mocks and do not require live portal credentials to pass.

### Run Full Test Suite:
```bash
npm test
```

### Run Live Upstream Portal Verification:
To verify the wrapper against the real, running upstream portal using your credentials in `.env`:
```bash
npm run test:live
```

---

## Interactive Documentation & OpenAPI

- **Interactive Swagger UI**: Navigate to [http://localhost:3000/docs](http://localhost:3000/docs) in your browser.
- **Raw OpenAPI Specification**: Available in JSON at [http://localhost:3000/openapi.json](http://localhost:3000/openapi.json) or in YAML at [`docs/openapi.yaml`](./docs/openapi.yaml).

---

## API Endpoints & Curl Examples

### 1. Health Check
Returns service status, uptime, and upstream authentication status.
```bash
curl -s http://localhost:3000/health
```
**Response**:
```json
{
  "status": "ok",
  "service": "flock-energy-api",
  "version": "1.0.0",
  "uptime": 142,
  "timestamp": "2026-10-27T01:45:00.000Z",
  "upstream": {
    "url": "https://urja-ops.flockenergy.tech",
    "authenticated": true
  }
}
```

### 2. List Smart Meters
Retrieves paginated smart meters. Supports search query `q` matching meter IDs or serial numbers.
```bash
curl -s "http://localhost:3000/api/v1/meters?q=J100000&page=1"
```
**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "meter_id": "J100000",
      "serial_number": "SE33962",
      "make": "HPL",
      "phase_type": "single",
      "status": "DECOMMISSIONED",
      "dt_code": "DT-001"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1,
    "total_pages": 1
  }
}
```

### 3. Retrieve Specific Meter Details
Fetches nameplate parameters, status, GPS coordinates, and hierarchical position.
```bash
curl -s http://localhost:3000/api/v1/meters/J100000
```
**Response**:
```json
{
  "status": "success",
  "data": {
    "meter_id": "J100000",
    "serial_number": "SE33962",
    "make": "HPL",
    "phase_type": "single",
    "status": "DECOMMISSIONED",
    "installation_type": "Whole Current",
    "location": {
      "latitude": 26.938961002479868,
      "longitude": 75.83095696146852
    },
    "hierarchy": {
      "zone": { "name": "Jaipur Zone 1", "code": "Z-01" },
      "circle": { "name": "Circle 1", "code": "C-01" },
      "division": { "name": "Division 1", "code": "D-01" },
      "subdivision": { "name": "Subdivision 1", "code": "SD-01" },
      "substation": { "name": "Substation 1", "code": "SS-01" },
      "feeder": { "name": "Feeder 1", "code": "F-001" },
      "dt": { "name": "Malviya Nagar DT 1", "code": "DT-001" }
    }
  }
}
```

### 4. Retrieve Meter Consumption History
Returns 30-minute interval readings (kWh, kVAh, Voltage) over a 7-day window.
```bash
curl -s http://localhost:3000/api/v1/meters/J100000/consumption
```
**Response**:
```json
{
  "status": "success",
  "data": {
    "meter_id": "J100000",
    "readings_count": 337,
    "readings": [
      {
        "timestamp": "2026-06-23T23:30:00Z",
        "raw_timestamp": "23/06/2026 23:30",
        "kwh": 48438.74,
        "kvah": 52313.84,
        "voltage_r": 226
      }
    ]
  }
}
```

### 5. Retrieve Network Distribution Hierarchy
Returns the full reconstructed network hierarchy tree (Zone → Circle → Division → Subdivision → Substation → Feeder → Distribution Transformer → Meters).
```bash
curl -s http://localhost:3000/api/v1/hierarchy
```
To bypass the in-memory cache and force a fresh reload from upstream:
```bash
curl -s "http://localhost:3000/api/v1/hierarchy?refresh=true"
```

---

## Security & Production Hardening

- **No Credential Leakage**: Error middleware sanitizes all outgoing responses. Under no circumstances are upstream session cookies, passwords, or raw stack traces returned to API consumers.
- **CSRF & Origin Compliance**: SvelteKit requires valid `Origin` and `Referer` headers on all POST form submissions; `UrjaClient` injects these dynamically.
- **Concurrency & Storm Protection**: `loginPromise` acts as a mutex lock preventing login storms when multiple requests arrive simultaneously.
- **Downstream Protection**: Optional `API_KEY` enforcement prevents the wrapper from operating as an open proxy.
- **Rate Limiting**: Configured with `express-rate-limit` to prevent denial-of-service abuse.

---

## Assumptions, Trade-Offs & Omissions

### Assumptions Made
1. **Session Lifecycle**: The upstream portal's session token expires in 1 hour (`Max-Age=3600`). Reactive re-authentication on 401/redirect with a single retry is cleaner and more robust than speculative timer-based refreshes.
2. **Network Hierarchy Stability**: Electrical grid structures change infrequently. Caching the reconstructed tree for 10 minutes provides high throughput with negligible upstream impact.
3. **Upstream Page Size**: Upstream search `/portal/meters/search` enforces a hardcoded `pageSize: 20`. The wrapper reports this accurately in pagination metadata rather than fabricating unverified paging behaviors.

### Trade-Offs & Intentional Omissions
1. **In-Memory Cache vs Redis**: In-memory caching was selected to keep the application zero-dependency and runnable locally with zero external services (Docker/Redis). For distributed multi-instance production, Redis should be adopted.
2. **Cheerio Parsing vs Pure JSON**: Nameplate details are retrieved from the server-rendered HTML at `/meters/:id` using Cheerio because the portal does not expose a standalone `/portal/meters/:id` JSON endpoint. While slower than pure JSON, this guarantees 100% fidelity to what operations staff see in the browser.
3. **No Database Engine**: A database was omitted per project instructions to keep the wrapper lightweight, stateless, and focused on API mediation.

---

## Deliverables & Core Links

- **Protocol Findings & Discovery Log**: [PROTOCOL.md](./PROTOCOL.md)
- **Authoritative OpenAPI 3.0.3 Specification**: [openapi.json](./openapi.json) / [docs/openapi.yaml](./docs/openapi.yaml)
- **Engineering Reflection (5 Questions)**: [REFLECTION.md](./REFLECTION.md)
