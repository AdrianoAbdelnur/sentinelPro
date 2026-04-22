# Sentinel Pro - Technical Detail

Last updated: 2026-04-20
Scope: Full repository analysis based on current codebase state.

## 1. Executive summary
Sentinel Pro is a fullstack operations console built with Next.js 16 + TypeScript. It combines:
- Frontend operational dashboards (`/`, `/live`, `/prevention`)
- Backend integration facade routes (`/api/integrations/*`)
- Provider integration clients (`howen`, `cv200`)

The current system is functional and already supports real operational flows (connection, devices, alarms, recordings, live streaming, diagnostics). The most relevant maintenance risks are:
- No user auth/authz layer in API routes
- Very large client pages with mixed responsibilities
- Strong reliance on external providers and network quality
- No automated test suite

## 2. What the project does
Primary purpose:
- Multi-brand mobile security camera fleet monitoring and prevention operations.

Main operator flows implemented:
- Dashboard: integration health, device list, events, recordings, overview, single live preview.
- Live monitor: fleet grouping, map visualization, multi-slot live playback (Howen + CV200).
- Prevention: top alarm ranking by time window, real-time alarm feed, evidence lookup.
- AI Insights (on-demand): secondary AI analysis for Howen events using external Python analyzer service.

UI language policy:
- All user-visible text in frontend views (`/`, `/live`, `/prevention`) must be in Spanish.

## 3. Technology stack
- Language: TypeScript
- Framework: Next.js 16 App Router
- UI: React 19, Tailwind CSS v4
- Maps: Leaflet
- Video playback:
  - Howen: FLV (`flv.js`) and iframe real video URLs
  - CV200: HLS (`hls.js`)
- Package manager: npm
- Build: `next build` (Turbopack)
- Lint: ESLint + `eslint-config-next`
- Typecheck: `tsc --noEmit`
- Tests: not configured

## 4. General structure
- `app/`
  - UI pages and all API route handlers
- `app/api/integrations/howen/*`
  - Howen backend facade
- `app/api/integrations/cv200/*`
  - CV200 backend facade
- `lib/http/api.ts`
  - Shared API envelope helpers (`ok`, `fail`, `fromError`, query helpers)
- `lib/integrations/howen/*`
  - Config, client, service facade, error model, logger, provider types
  - AI insights bridge for on-demand event analysis (`ai-insights`)
- `lib/integrations/cv200/client.ts`
  - CV200 upstream client + mapping to UI-compatible device shape
- `lib/features/prevention/*`
  - Prevention-domain aggregation logic
- `documentations/`
  - Vendor references (Howen/CV200 PDFs)
- `.runtime/`
  - Persisted Howen session file when enabled

## 5. System architecture
Layering observed:
1. UI pages (`use client`) call internal API routes
2. Route handlers validate input and normalize responses
3. Service layer (`HowenService`) composes provider operations
4. Provider clients call upstream systems

Patterns:
- Backend facade for each provider
- Provider shape adaptation (CV200 -> Howen-like device shape)
- Common response envelope
- In-memory + disk session cache for Howen

Strong coupling points:
- Large pages include both UI rendering and business orchestration logic
- Repeated device parsing helpers across multiple pages
- Dynamic JSON-driven structures (`Record<string, unknown>`) instead of strict end-to-end domain types

## 6. Key modules and files
- `lib/integrations/howen/client.ts`
  - Core provider client: login, token/pid session cache, persistence, refresh loop, upstream POST calls.
- `lib/integrations/howen/service.ts`
  - Provider facade used by routes, includes composed `overview` and realvideo URL generation.
- `lib/http/api.ts`
  - Shared envelope and error conversion logic.
- `app/api/integrations/howen/live/route.ts`
  - FLV stream proxy endpoint.
- `app/api/integrations/howen/probe/route.ts`
  - ffprobe diagnostics endpoint.
- `app/api/integrations/howen/alarm-stream/route.ts`
  - Howen WebSocket -> SSE bridge.
- `app/api/integrations/howen/evidence-file/route.ts`
  - Evidence file proxy with host allowlist.
- `app/api/integrations/howen/events/ai-insights/route.ts`
  - On-demand AI secondary-check endpoint for Howen events.
- `app/api/integrations/cv200/live/[...path]/route.ts`
  - HLS catch-all proxy to CV200 stream host.
- `app/live/page.tsx`
  - Most complex UI flow (fleet loading, map selection, multi-slot live matrix).
- `app/prevention/page.tsx`
  - Alarm ranking, real-time attention feed, evidence retrieval pipeline.
- `app/page.tsx`
  - Operational dashboard for core Howen checks.

## 7. Entities and business logic
Main entities:
- Howen session (`token`, `pid`, `cookie`, `expiresAtMs`)
- Device (heterogeneous provider payload normalized by helper extraction)
- Fleet summary (`fleetKey`, `fleetLabel`, online/offline counters)
- Alarm/event
- Recording/evidence
- Live grid slot (`deviceId`, `channel`, `provider`, URL)

Rules inferred from code:
- Online device: `accessmode >= 1` (Howen), plus CV200 fallback by active stream status.
- Valid channels: 1..32
- Stream selection: 0 substream, 1 mainstream
- Strict enum validation in recordings/overview params

## 8. Main flows step by step
### 8.1 Dashboard boot
1. `app/page.tsx` loads connection + devices on mount.
2. Calls `/api/integrations/howen/connection` and `/devices?all=1`.
3. Routes use `HowenService` -> `HowenClient.connect()`.
4. Session may be rehydrated from `.runtime/howen-session.json`.

### 8.2 Events and recordings query
1. User selects device/time range.
2. UI calls `/events` and `/recordings`.
3. Route validates required params and enums.
4. Service calls upstream and returns normalized envelope.

### 8.3 Howen live (single)
1. UI sets `livePath` to backend live route.
2. `flv.js` player mounts in browser.
3. Backend proxies FLV body from Howen stream URL.

### 8.4 Live Fleet monitor
1. Load fleet summaries from both providers.
2. Expand fleet -> load devices for that fleet.
3. Double-click device:
   - CV200: `live/start` then HLS URL resolve
   - Howen: status/probe -> channel selection -> `realvideo` URL build
4. Render slots as HLS player (CV200) or iframe (Howen).

### 8.5 Prevention ranking
1. Load all devices.
2. Filter online devices.
3. Run per-device event count queries in batches (concurrency 8).
4. Build ranking map and top list.

### 8.6 Prevention real-time alarms
1. Browser opens EventSource against `/howen/alarm-stream`.
2. Backend opens Howen WS, authenticates, subscribes, heartbeats.
3. Alarm WS messages are re-emitted as SSE event `alarm`.
4. UI parses, filters by selected alarm codes, deduplicates, renders.

### 8.7 Evidence retrieval
1. If alarm already has evidence URL, use proxy directly.
2. Else query `/howen/evidence` in +/-5 min window by alarm context.
3. If no match, fallback to `/howen/recordings` with alternative filters.
4. Show selected media in modal (video/image).

### 8.8 AI Insights (Howen event on-demand)
1. Client sends event payload to `POST /api/integrations/howen/events/ai-insights`.
2. Backend extracts event metadata and forensic video URL from `event`/`raw_event` payload.
3. Backend calls external Python analyzer (`AI_ANALYZER_URL/analyze-event`) with timeout.
4. API responds with standard envelope and merged payload:
   - `source: "howen"`
   - `raw_event`
   - `ai_insights` (timeline/durations/confidence from analyzer)

## 9. Configuration and external integrations
Environment variables currently used in code:
- Howen:
  - `HOWEN_BASE_URL`, `HOWEN_WEB_BASE_URL`, `HOWEN_STREAM_BASE_URL`
  - `HOWEN_USERNAME`, `HOWEN_PASSWORD`, `HOWEN_PASSWORD_IS_MD5`
  - `HOWEN_TIMEOUT_MS`, `HOWEN_DEBUG`, `HOWEN_LOG_SENSITIVE`
  - `HOWEN_AUTO_REFRESH`, `HOWEN_AUTO_REFRESH_INTERVAL_MIN`
  - `HOWEN_SESSION_PERSIST_PATH`, `HOWEN_WS_URL`
- CV200:
  - `CV200_INGEST_BASE_URL`, `CV200_STREAM_BASE_URL`, `CV200_RTMP_SERVER`
  - `CV200_MEDIAMTX_API_BASE_URL`
- Diagnostics:
  - `FFPROBE_PATH`
- AI Insights:
  - `AI_ANALYZER_URL`
  - `AI_ANALYZER_TIMEOUT_MS`

External dependencies and failure impact:
- Howen API/WS/stream host
- CV200 ingest service
- MediaMTX API and HLS host
- OpenStreetMap tile server
- Local/system ffprobe binary

## 10. Security review
Observed:
- No user authentication/authorization in route handlers.
- Sensitive provider session persisted in `.runtime/howen-session.json`.
- `evidence-file` route includes host allowlist checks (good control).
- CV200 HLS catch-all proxy accepts arbitrary path under configured host.
- No explicit rate limit / CSRF / CORS hardening layer.

## 11. Performance review
Observed:
- `cache: "no-store"` is used almost everywhere.
- Prevention ranking performs N calls for N online devices.
- Live page has periodic polling (`stream-status` and fleet refresh loops).
- SSE bridge opens one upstream WS per connected SSE client.
- Very large client components increase maintenance and optimization complexity.

## 12. Risks and technical debt
- Very large single-file pages:
  - `app/live/page.tsx` (~1301 lines)
  - `app/page.tsx` (~819 lines)
  - `app/prevention/page.tsx` (~638 lines)
- Duplicated extraction/normalization logic across files.
- Inconsistent strict typing (heavy use of generic JSON records).
- No automated tests.
- Build warning related to trace scope in probe route.
- Lint warning in evidence modal (`img` vs Next Image).

## 13. Most critical system parts
- `lib/integrations/howen/client.ts`
- `app/api/integrations/howen/live/route.ts`
- `app/api/integrations/howen/alarm-stream/route.ts`
- `app/live/page.tsx`
- `app/prevention/page.tsx`
- `app/api/integrations/cv200/live/[...path]/route.ts`
- `lib/http/api.ts`

## 14. Technical conclusion
Current maturity level: functional intermediate.

Strong points:
- Real end-to-end provider integration already running
- Clear facade direction by provider
- Practical operational features for live and prevention workflows

Main gaps to reach higher maturity:
- Add auth/authz model
- Add automated tests
- Reduce page complexity via modularization
- Harden production security and observability controls

## 15. Project glossary
- Howen VSS: primary current provider
- CV200: secondary provider integration
- SSE: server-sent events stream to UI
- WS: upstream WebSocket to provider
- RealVideo: Howen iframe player page
- Probe: stream diagnostics endpoint
- AttentionItem: prevention alarm UI entity
- GridSlot: live matrix playback tile

## Open questions
- What user auth/authz model is expected in production?
- What concurrent user/load target should live and SSE support?
- What is the production secret management strategy?
- Will there be a unified typed provider contract for all modules?
- What minimum automated test coverage is required?
- Is long-term internal persistence (database) planned, or provider passthrough only?
