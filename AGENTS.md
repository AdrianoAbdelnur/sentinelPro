## Project

Sentinel Pro is a multi-brand mobile security camera operations console.
Current implementation uses Next.js 16 + TypeScript and starts with Howen VSS integration:
connection status, fleet devices, events, recordings, live FLV proxy, and stream probe diagnostics.

## Related Projects

- Sentinel Pro frontend/API (this repo): `D:\CopiaD\backUp\Proyectos Web\sentinel-pro`
- Possible future connector expansions (Dahua, Hikvision, etc.) should preserve frontend contracts.

## Documentation Repository

- Integration documentation folder: `D:\CopiaD\backUp\Proyectos Web\sentinel-pro\documentations`
- Store vendor/API references here (Howen, Dahua, Hikvision, etc.) and treat them as primary local source before assumptions.
- Project technical detail file: `D:\CopiaD\backUp\Proyectos Web\sentinel-pro\PROJECT_TECHNICAL_DETAIL.md`

## How To Work

- Before touching code, first explain what is proposed, how it will be done, and where.
- Do not modify any code until the user explicitly approves the proposed plan.
- Make minimal, clear, and easy-to-verify changes.
- Do not refactor unrelated parts.
- Move in stages, prioritizing small changes.
- Keep `PROJECT_TECHNICAL_DETAIL.md` updated as a living document whenever features, flows, contracts, or architecture details change.

## Rules

- Use TypeScript.
- Do not add libraries unless truly necessary.
- Do not duplicate logic.
- Do not use hacks.
- Do not leave dead code.
- Do not break route contracts, query params, response envelope, or existing flows.
- Keep integration/provider boundaries clean (provider-specific logic in `lib/integrations/*`).
- Never commit or push directly to `main`.

## Structure

- `app`: App Router pages + API Route Handlers
  - `app/page.tsx`: operational dashboard (connection/devices/events/recordings/overview + single live view)
  - `app/live/page.tsx`: fleet live monitor with map + modal multi-channel player
  - `app/api/health/route.ts`: health endpoint
  - `app/api/integrations/howen/*/route.ts`: Howen integration endpoints
- `lib/http/api.ts`: shared API response helpers (`ok`, `fail`, `fromError`) and query parsing
- `lib/integrations/howen`:
  - `config.ts`: env parsing/validation
  - `client.ts`: login/session/cache/persist + upstream calls
  - `service.ts`: integration service facade
  - `types.ts`: provider/request/response contracts
  - `errors.ts`, `logger.ts`: error model and operational logging
- `assets`, `public/assets`: static assets for UI/map markers
- `.runtime`: persisted Howen session (token/pid/cookie) when enabled

## Main Flow

1. User opens Dashboard (`app/page.tsx`) and checks integration connection.
2. Dashboard fetches devices from `GET /api/integrations/howen/devices`.
3. User queries events, recordings, overview by selected device/time range.
4. Live stream is requested through backend proxy `GET /api/integrations/howen/live`.
5. Live Fleet page (`app/live/page.tsx`) refreshes devices, renders selected units on map, and opens per-device live modal.
6. Optional channel diagnostics run through `GET /api/integrations/howen/probe`.

## Backend Integration (Critical Contracts)

- Standard response envelope from backend routes:
  - success: `{ success: true, data, meta? }`
  - error: `{ success: false, error: { code, message, providerCode? } }`
- Current provider: Howen (`source: "howen"` in service responses).
- Endpoints and required/important params:
  - `GET /api/health`
  - `GET /api/integrations/howen/connection`
  - `GET /api/integrations/howen/devices`
    - query: `all`, `page`, `pageSize`, `isOnline`, `keyword`, `fleetId`
  - `GET /api/integrations/howen/events`
    - required: `deviceId`, `beginTime`, `endTime`
    - optional: `page`, `pageSize`, `alarmType`
  - `GET /api/integrations/howen/recordings`
    - required: `deviceId`, `startTime`, `endTime`
    - optional: `channelList`, `fileType(1|2|3|4)`, `location(1|2|4|5)`, `scheme(http|https)`
  - `GET /api/integrations/howen/overview`
    - required: `deviceId`, `beginTime`, `endTime`
    - optional: `channelList`, `alarmType`, `fileType`, `location`
  - `GET /api/integrations/howen/live`
    - required: `deviceId`
    - optional: `channel(1..32)`, `stream(0|1)`
    - returns FLV stream (`video/x-flv`) proxied by backend
  - `GET /api/integrations/howen/probe`
    - required: `deviceId`
    - optional: `channel(1..32)`, `stream(0|1)`, `timeoutMs`
- Preserve compatibility for frontend parsing in `app/page.tsx` and `app/live/page.tsx` (device/event/recordings list shape and IDs).

## Environment Variables / Config

Required:

- `HOWEN_BASE_URL`
- `HOWEN_USERNAME`
- `HOWEN_PASSWORD`

Optional (with defaults):

- `HOWEN_STREAM_BASE_URL`
- `HOWEN_PASSWORD_IS_MD5=false`
- `HOWEN_TIMEOUT_MS=15000`
- `HOWEN_DEBUG=true`
- `HOWEN_LOG_SENSITIVE=false`
- `HOWEN_AUTO_REFRESH=true`
- `HOWEN_AUTO_REFRESH_INTERVAL_MIN=25`
- `HOWEN_SESSION_PERSIST_PATH=.runtime/howen-session.json`

Notes:

- If `HOWEN_PASSWORD_IS_MD5=false`, MD5 is calculated in client before login.
- Session token/pid/cookie can be persisted to disk and auto-refreshed in background.

## Next.js / Runtime Notes

- API routes are Node runtime (`export const runtime = "nodejs"`).
- Keep server-only behavior in Route Handlers / lib integration layer.
- Live proxy and probe are latency-sensitive; avoid unnecessary extra transformations.
- Be careful with async effects, cleanup, and player destruction in client pages (`flv.js` + modal/map lifecycle).

## Validation

- Review TypeScript types and imports.
- Verify dashboard flow: connection -> devices -> events/recordings/overview.
- Verify live flow: devices refresh -> map selection -> modal live channels -> resume behavior.
- Verify API validations for required params and allowed enum values.
- Run before commit:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run build`
- Never commit if lint/build/types fail.
- Report touched files and what to test manually.

## Useful Commands

- `npm install`
- `npm run dev`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm run start`

## Branch Discipline

When changing work topic (feature/bugfix/chore area), switch to a branch that matches the new topic before making any commit.

Mandatory flow:
1. Check current branch status first.
2. If there are pending local changes (not committed or not pushed), do not switch branch automatically.
3. In that case, stop and ask the user how to proceed.
4. Only switch branch when the current branch is clean (no pending commit/push work).
5. Create a new branch or checkout an existing matching branch.
6. Confirm branch name matches the new topic.
7. Only then stage, commit, and push.

Never keep committing unrelated topics to the same long-lived branch.
Never change branch while there are pending changes unless the user explicitly approves the action.

