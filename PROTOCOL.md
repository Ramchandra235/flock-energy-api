# Upstream Portal Protocol & Reverse Engineering Findings

This document records the exact, verified technical discoveries made during inspection of the **Urja Meter Ops** legacy portal (`https://urja-ops.flockenergy.tech`).

---

## 1. Executive Summary & Verification Summary

| Discovery Area | Upstream Implementation | Verification Method | Confidence Level |
| :--- | :--- | :--- | :--- |
| **Framework & Runtime** | SvelteKit (`X-Sveltekit-Page: true`, client-side hydration chunks) | DevTools / HTTP headers / Chunk inspection | **Confirmed Fact** (100%) |
| **Authentication Form** | `POST /login` with `x-www-form-urlencoded` | Live curl / Network traces | **Confirmed Fact** (100%) |
| **CSRF / Origin Check** | Requires `Origin: https://urja-ops.flockenergy.tech` and `Referer` headers; rejects with `403 Forbidden: Cross-site POST form submissions are forbidden` otherwise | Live curl with & without headers | **Confirmed Fact** (100%) |
| **Session Cookie** | `__Secure-better-auth.session_token` (HttpOnly, Secure, SameSite=Lax, Max-Age=3600) | Live response `Set-Cookie` header | **Confirmed Fact** (100%) |
| **Auth Failure Payload** | Returns **HTTP 200 OK** with JSON payload: `{"type":"failure","status":401,"data":"[{\"email\":1,\"error\":2},...]"}` | Injected bad credentials test | **Confirmed Fact** (100%) |
| **Auth Success Payload** | Returns **HTTP 200 OK** with JSON payload: `{"type":"redirect","status":303,"location":"/meters"}` and `Set-Cookie` | Live credentials test | **Confirmed Fact** (100%) |
| **Meter Search API** | `GET /portal/meters/search?q={query}&page={page}` (JSON response) | Client bundle deobfuscation & live curl | **Confirmed Fact** (100%) |
| **Meter Details** | Server-side rendered HTML at `GET /meters/{id}` (`<dl>` key-value nameplate & `<nav>` breadcrumbs) | Live HTML & SvelteKit SSR state inspection | **Confirmed Fact** (100%) |
| **Meter Location** | `GET /portal/meters/{id}/geo` (JSON: `{ data: { latitude, longitude } }`) | Extracted from `nodes/6.l777LXKL.js` & verified live | **Confirmed Fact** (100%) |
| **Meter Consumption** | `GET /portal/meters/{id}/energy` (JSON: `{ data: [ { timestamp, kwh, kvah, voltR } ] }`) | Extracted from `nodes/6.l777LXKL.js` & verified live | **Confirmed Fact** (100%) |
| **Transformers Listing**| `GET /portal/dts?page={page}` (JSON: `{ data: [ { code, name, feederCode, capacityKva } ], total: 40 }`) | Extracted from `nodes/4.2Bgc2kUI.js` & verified live | **Confirmed Fact** (100%) |
| **Full Dataset Export** | `GET /portal/export?page=1` with HMAC-SHA256 signature using secret from `GET /portal/keys` | Extracted from `nodes/4.2Bgc2kUI.js` & executed live | **Confirmed Fact** (100%) |

---

## 2. Authentication & Session Lifecycle

### 2.1 The Login Flow
The portal login is handled at `POST /login`.

- **Endpoint**: `https://urja-ops.flockenergy.tech/login`
- **Method**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Body parameters**:
  - `email`: `operator@urja.local`
  - `password`: `urja-ops-2026`

#### Critical Discovery: SvelteKit Cross-Site POST Protection
When sending an automated POST request without browser context:
```http
POST /login HTTP/1.1
Host: urja-ops.flockenergy.tech
Content-Type: application/x-www-form-urlencoded

email=operator%40urja.local&password=urja-ops-2026
```
The server responds with:
```http
HTTP/1.1 403 Forbidden
Content-Type: text/plain

Cross-site POST form submissions are forbidden
```
**Fix/Requirement**: SvelteKit validates that the `Origin` header matches the host. The client must supply:
- `Origin: https://urja-ops.flockenergy.tech`
- `Referer: https://urja-ops.flockenergy.tech/login`

### 2.2 SvelteKit Form Action Response Traps
The portal uses SvelteKit Form Actions, leading to deceptive HTTP status codes:

1. **Successful Authentication**:
   ```http
   HTTP/1.1 200 OK
   Content-Type: application/json
   Set-Cookie: __Secure-better-auth.session_token=ux4hCspcnfct7QiY...; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax

   {"type":"redirect","status":303,"location":"/meters"}
   ```
2. **Failed Authentication (Bad Credentials)**:
   ```http
   HTTP/1.1 200 OK
   Content-Type: application/json

   {"type":"failure","status":401,"data":"[{\"email\":1,\"error\":2},\"operator@urja.local\",\"Invalid email or password.\"]"}
   ```
   *Quirk*: The HTTP status code is **200 OK**, but the body specifies `type: "failure"` and `status: 401`. A naive HTTP client checking `response.status === 200` would falsely assume login succeeded!

### 2.3 Session Persistence & Expiry Detection
- The session token is persisted in cookie `__Secure-better-auth.session_token`.
- Valid for 1 hour (`Max-Age=3600`).
- **Unauthenticated / Expired State on API routes** (`/portal/*`):
  - Upstream responds with `HTTP 401 Unauthorized` and JSON error.
- **Unauthenticated / Expired State on Page routes** (`/meters/*`):
  - Upstream issues `HTTP 302 Found` with `Location: /login` or serves the HTML login page with `<title>Urja Meter Ops — Sign in</title>`.
- **Handling in Wrapper**:
  - `UrjaClient` uses Axios interceptors to detect HTTP 401, redirect location `/login`, or login page HTML content.
  - Automatically re-authenticates and retries the failed request once (`_retry` flag prevents infinite loops).
  - Mutex lock (`loginPromise`) guarantees that concurrent requests wait on a single shared login transaction rather than flooding the upstream portal.

---

## 3. Discovered Upstream Endpoints

### 3.1 Meter Search Endpoint (`GET /portal/meters/search`)
- **URL**: `/portal/meters/search?q={query}&page={page}`
- **Method**: `GET`
- **Query Parameters**:
  - `q`: Search query (searches meter ID or serial number prefix, e.g. `J100000` or `SE33962`). Note: search does not filter by make.
  - `page`: Page index (1-based integer).
  - `pageSize`: Upstream hardcodes page size to `20`.
- **Response Structure**:
```json
{
  "data": [
    {
      "meterId": "J100000",
      "serialNo": "SE33962",
      "make": "HPL",
      "phaseType": "single",
      "installStatus": "Decommissioned",
      "dtCode": "DT-001"
    }
  ],
  "total": 403,
  "page": 1,
  "pageSize": 20
}
```

### 3.2 Meter Detail Page (`GET /meters/:id`)
- **URL**: `/meters/{meterId}`
- **Method**: `GET`
- **Response**: Server-Side Rendered HTML page.
- **Data extracted by Cheerio**:
  1. **Nameplate**: Extracted from `<dl>` `<dt>` and `<dd>` elements:
     - `Meter ID`
     - `Serial No`
     - `Make`
     - `Phase Type`
     - `Installation Status`
     - `Installation Type` (e.g. `Whole Current`, `CT Operated`)
  2. **Hierarchy Breadcrumbs**: Extracted from `<nav class="flex flex-wrap"><span>...</span></nav>`:
     - Zone: `Jaipur Zone 1 (Z-01)`
     - Circle: `Circle 1 (C-01)`
     - Division: `Division 1 (D-01)`
     - Subdivision: `Subdivision 1 (SD-01)`
     - Sub Station: `Substation 1 (SS-01)`
     - Feeder: `Feeder 1 (F-001)`
     - DT: `Malviya Nagar DT 1 (DT-001)`
- **Data Variations Discovered**:
  - In `legacy` meters (e.g. `J100000`), SvelteKit state holds:
    `detail: { data: [{ parameterName: "Meter ID", parameterValue: "J100000" }, ...] }`
  - In `v2` meters (e.g. `J100004`), SvelteKit state holds:
    `detail: { classData: "{\"installed_meter\":{\"MeterId\":\"J100004\",\"SerialNo\":\"SE65293\",...}}" }`
  - Because our service parses the server-rendered `<dl>` HTML tags directly, both formats are normalized uniformly.

### 3.3 Meter Geolocation (`GET /portal/meters/:id/geo`)
- **URL**: `/portal/meters/{meterId}/geo`
- **Method**: `GET`
- **Response**:
```json
{
  "data": {
    "latitude": "26.938961002479868",
    "longitude": "75.83095696146852"
  }
}
```
- Returns 404 with `{"error":"not_found","message":"Meter not found"}` if meter does not exist.

### 3.4 Meter Consumption History (`GET /portal/meters/:id/energy`)
- **URL**: `/portal/meters/{meterId}/energy`
- **Method**: `GET`
- **Response**:
```json
{
  "data": [
    {
      "timestamp": "23/06/2026 23:30",
      "kwh": "48438.74",
      "kvah": "52313.84",
      "voltR": "226"
    }
  ]
}
```
- Upstream returns 337 readings per meter representing 30-minute intervals across 7 days.
- Quirk: Numbers are returned as strings (`"48438.74"`, `"226"`). Timestamps are in Indian local time `DD/MM/YYYY HH:mm`.

### 3.5 Distribution Transformers (`GET /portal/dts`)
- **URL**: `/portal/dts?page={page}`
- **Method**: `GET`
- **Response**:
```json
{
  "data": [
    {
      "code": "DT-001",
      "name": "Malviya Nagar DT 1",
      "feederCode": "F-001",
      "capacityKva": 100
    }
  ],
  "total": 40,
  "page": 1,
  "pageSize": 20
}
```

### 3.6 Secret Keys & HMAC Signed Export (`GET /portal/keys` & `GET /portal/export`)
- **Secret Retrieval**: `GET /portal/keys`
  ```json
  { "data": { "signingSecret": "I3dZPPf5CgTp7JyGNMI8i6z8LFR7TmSR" } }
  ```
- **HMAC Signature Generation**:
  - Timestamp: UNIX seconds string (`Math.floor(Date.now() / 1000)`)
  - Canonical message: `['GET', '/portal/export', 'page=1', timestamp].join('\n')`
  - Signature: HMAC-SHA256 hex digest using `signingSecret`
- **Export Endpoint**: `GET /portal/export?page=1`
  - Headers:
    - `x-timestamp: <timestamp>`
    - `x-signature: <hex_signature>`
  - Response: Contains complete dataset of all 403 meters with nested hierarchy trees and GPS coordinates in a single call.

---

## 4. Known Quirks, Traps & Mitigations

1. **Trap: HTTP 200 on Auth Failure**
   - *Issue*: Upstream returns HTTP 200 with JSON payload `type: 'failure'` on bad login.
   - *Mitigation*: Explicit inspection of `response.data.type !== 'failure'` and presence of session cookie.
2. **Trap: CSRF 403 on Login**
   - *Issue*: SvelteKit rejects requests lacking matching `Origin` / `Referer`.
   - *Mitigation*: Automated injection of `Origin` and `Referer` headers matching `URJA_BASE_URL`.
3. **Trap: Inconsistent Detail Schemas (`legacy` vs `v2`)**
   - *Issue*: Different meter records serialize their raw data differently (`data` array vs `classData` JSON string).
   - *Mitigation*: Dual parsing strategy: Cheerio parses the normalized DOM representation from the SSR HTML, with fallback to JSON parser for `classData`.
4. **Trap: Stringified Numbers and Localized Timestamps**
   - *Issue*: Upstream returns numbers as strings and timestamps as `DD/MM/YYYY HH:mm`.
   - *Mitigation*: Reusable normalization pipeline (`parseNumeric`, `normalizeDate`) converts types predictably without timezone shifting.
