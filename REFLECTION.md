# Engineering Reflection

## 1. What assumptions did I make?

- **Upstream Portal Stability & Session Semantics**: I assumed that the portal's session lifetime of 1 hour (`Max-Age=3600`) as advertised by `__Secure-better-auth.session_token` was standard and consistent. I designed the client with a proactive single-retry on 401/redirect rather than attempting preemptive cookie expiration timers, assuming network errors and unpredictable invalidations are best handled reactively.
- **Data Uniformity Across Meter Builds**: When inspecting the initial meter `J100000`, it appeared that all meter details were rendered in standard HTML `<dl>` tags. I assumed the rendered HTML structure would remain consistent even though the underlying data models differed between `legacy` (array of key-values) and `v2` (`classData` JSON string). Inspecting the SvelteKit frontend bundle confirmed that SvelteKit normalized both to the same DOM representation, validating the HTML parsing strategy.
- **Network Hierarchy Immutability**: I assumed that utility network hierarchy (zones, circles, feeders, distribution transformers) changes infrequently during operations. Consequently, caching the reconstructed hierarchy in-memory with a 10-minute TTL was assumed to be an optimal balance between low upstream load and data freshness.

---

## 2. Which part was the most difficult, and how did I get unstuck?

- **The SvelteKit CSRF Protection & Form Actions Response Quirk**:
  The most tricky challenge was executing the initial programmatic login. When sending a standard POST request with valid credentials, the upstream portal immediately responded with `HTTP 403 Forbidden: Cross-site POST form submissions are forbidden`.
  - *How I got unstuck*: Recognizing that the portal was built with modern SvelteKit, I realized that SvelteKit implements origin checking on all form actions to prevent cross-site request forgery. By analyzing the browser headers and injecting `Origin: https://urja-ops.flockenergy.tech` and `Referer: https://urja-ops.flockenergy.tech/login`, the request passed.
  - Furthermore, inspecting bad login attempts revealed that the server returns an **HTTP 200 OK** containing a JSON failure payload (`{"type":"failure","status":401,...}`). I unstuck this potential trap by ensuring the client explicitly validates `response.data.type !== 'failure'` and verifies the establishment of `__Secure-better-auth.session_token` in the cookie jar before marking the session as authenticated.

---

## 3. If I had another day, what would I improve?

- **Distributed Caching with Redis**: Currently, the hierarchy cache and session state reside in Node.js process memory. In a multi-replica horizontal deployment (e.g. Kubernetes or ECS), multiple instances would maintain separate cookie jars and re-authenticate independently. I would back the session storage and hierarchy cache with Redis to share authenticated session tokens and cached datasets across nodes.
- **Bulk Data Ingestion & Local Query Index (SQLite / PostgreSQL)**:
  Because the HMAC-signed export endpoint (`/portal/export?page=1`) allows exporting all 403 meters in a single call, I would implement a scheduled background sync worker that ingests the full dataset into an indexed SQLite or PostgreSQL database. This would enable advanced query capabilities that the legacy portal cannot support, such as geospatial radius filtering ("find all meters within 5km of coordinate X"), filtering across multiple attributes (make + phase + DT), and instant zero-latency responses.
- **Streaming & SSE for Real-Time Meter Telemetry**:
  For consumption readings, I would add a Server-Sent Events (SSE) or WebSocket endpoint allowing frontends or SCADA dashboards to subscribe to live updates as new intervals are polled.

---

## 4. What mistake did I make while solving this?

- **Regex Boundary Assumption in Error Sanitizer**:
  While implementing the sensitive parameter sanitizer in `errorHandler.js`, I initially wrote the replacement regex as `message.replace(/password=[^&]+/gi, 'password=***')`. I assumed parameters would always follow query-string formatting where an ampersand (`&`) separates fields. However, when an error message contained plain text such as `"Failed with password=secret_password and session_token=secret_token"`, the greedy `[^&]+` match swallowed both parameters into a single string.
  - *Correction*: I fixed the regex to terminate at whitespace and punctuation (`/[^\s&;]+/`), allowing each sensitive token to be cleanly and independently sanitized.

---

## 5. If I were reviewing my own submission, what would I criticize?

- **Memory Hierarchy Rebuild on Large Scale**:
  Reconstructing the nested hierarchy tree in-memory from the export endpoint works well for 403 meters (executing in under 5ms). However, if the utility expands to hundreds of thousands of smart meters, holding the full raw export and reconstructing nested objects in V8 heap memory would create garbage collection pressure and latency spikes. I would recommend stream processing (using JSON streaming parsers) or persisting the hierarchy into an indexed relational or document store.
- **Tight Coupling to Specific Upstream HTML Selectors**:
  While the search, geo, consumption, and export endpoints utilize structured JSON, meter nameplate details rely on Cheerio parsing the `<dl>` and `<nav>` elements of the server-side rendered `/meters/:id` page. If the upstream UI designers redesign the CSS or replace the definition list with custom cards, the HTML parser would need adjustment. I did mitigate this with fallback parsing of the inline SvelteKit SSR state, but moving toward an all-JSON upstream pipeline would be even more resilient.
