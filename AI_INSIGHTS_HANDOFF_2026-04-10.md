# AI Insights Handoff (2026-04-10)

Purpose: resume work later (after shutdown) and make the Howen -> AI Insights flow fully operational with minimal friction.

## 1. What was completed in Sentinel Pro

Implemented on-demand endpoint naming requested by product:

- `POST /api/integrations/howen/events/ai-insights`

Files added/updated in this repository:

- `app/api/integrations/howen/events/ai-insights/route.ts`
- `lib/integrations/howen/ai-insights.ts`
- `.env.example`
- `PROJECT_TECHNICAL_DETAIL.md` (updated date + new AI Insights flow sections)

Behavior implemented:

1. Receives JSON body with:
   - `event` object, or
   - `raw_event` object, or
   - direct event object as root payload.
2. Extracts `forensic_video_url` from known fields:
   - `event.media.forensic_video_url`
   - `event.media.forensicVideoUrl`
   - `forensic_video_url`
   - `forensicVideoUrl`
   - `downUrl`
3. Calls external Python analyzer:
   - `POST {AI_ANALYZER_URL}/analyze-event`
4. Returns standard envelope with:
   - `source: "howen"`
   - `raw_event`
   - `ai_insights`

Validation behavior:

- Invalid JSON -> `VALIDATION_ERROR` (400)
- Missing event object -> `VALIDATION_ERROR` (400)
- Missing forensic video URL -> `VALIDATION_ERROR` (400)
- Missing `AI_ANALYZER_URL` -> `INTEGRATION_CONFIG_ERROR` (500)
- Upstream analyzer/network failure -> generic server error path

## 2. External Python service (separate project) status

A new independent project was created (without touching original `vision-stream/gem_detect.py`):

- `D:\CopiaD\backUp\Proyectos Web\Python\servidor python\vision-event-enricher`

Files there:

- `app.py` (FastAPI app, routes `/health`, `/analyze-event`)
- `detector/engine.py` (video analysis logic for microsleep/yawn timing)
- `detector/schemas.py` (request/response models)
- `requirements.txt`
- `README.md`

Current contract (Python side):

- Endpoint: `POST /analyze-event`
- Request expects `event_id`, `forensic_video_url`, optional metadata.
- Response returns:
  - `ok: true`
  - `analysis` payload with timings/timeline/confidence.

## 3. Environment variables now required for integration

Sentinel Pro (`.env.local`):

- `AI_ANALYZER_URL=http://127.0.0.1:8001`
- `AI_ANALYZER_TIMEOUT_MS=20000`

Already documented in `.env.example`.

## 4. Build/quality checks already run in Sentinel Pro

Executed successfully on 2026-04-10:

- `npx tsc --noEmit`
- `npm run lint` (1 pre-existing warning in `app/prevention/_components/EvidenceModal.tsx` about `<img>`)
- `npm run build` (passes; includes pre-existing Turbopack warning related to `probe/route.ts`)

## 5. How to run everything next time

### 5.1 Start Python AI analyzer

From:

- `D:\CopiaD\backUp\Proyectos Web\Python\servidor python\vision-event-enricher`

Run:

1. `python -m venv .venv`
2. `.venv\Scripts\activate`
3. `pip install -r requirements.txt`
4. `uvicorn app:app --host 0.0.0.0 --port 8001 --reload`

Quick check:

- `GET http://127.0.0.1:8001/health` should return `{ "status": "ok" }`

### 5.2 Start Sentinel Pro

From:

- `D:\CopiaD\backUp\Proyectos Web\sentinel-pro`

Ensure `.env.local` has `AI_ANALYZER_URL` and `AI_ANALYZER_TIMEOUT_MS`, then run:

1. `npm run dev`

## 6. Manual API test (recommended first test)

Call Sentinel endpoint:

`POST http://localhost:3000/api/integrations/howen/events/ai-insights`

Sample body:

```json
{
  "event": {
    "event_id": "GDE-a7ff965a",
    "external_vehicle_id": "861778062948509",
    "external_vehicle_domain": "AH 712 CJ",
    "timestamp_utc": "2026-04-09T04:27:08Z",
    "event_type": "MICROSUENO_REAL",
    "media": {
      "forensic_video_url": "https://videoserver.eye.praxsys.com.ar/processed_videos/20260409_042708_D1_2.mp4"
    }
  }
}
```

Expected response envelope:

```json
{
  "success": true,
  "data": {
    "source": "howen",
    "raw_event": {},
    "ai_insights": {}
  }
}
```

## 7. What is still pending

1. Wire this endpoint into UI flow (`/prevention`) so operators can trigger/view `ai_insights`.
2. Decide trigger mode:
   - manual button per alarm, or
   - automatic for selected alarm codes.
3. Add clearer error mapping for analyzer failures:
   - timeout
   - unreachable analyzer
   - malformed analyzer response.
4. Optional: add typed contracts shared between Next and Python.
5. Optional phase 2: LLM narrative (`physio_explanation`) built from `ai_insights` numeric signals.

## 8. Suggested first action in next conversation

Start with this request:

- "Conectemos `ai-insights` en `app/prevention/page.tsx` para que al abrir Evidence también consulte y muestre microsleep/yawn timings."

Then implement in small stages:

1. fetch integration
2. UI block in Evidence modal
3. loading/error states
4. final manual test.

## 9. Notes / caveats

- The new Python project is outside this repo; it must be run separately.
- Current persistence mode is on-demand only (no DB writes).
- Existing Howen route contracts were kept intact; this was added as a new endpoint only.
