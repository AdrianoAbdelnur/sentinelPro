# Sentinel Pro Backend

Backend API en Next.js 16 para integracion de plataformas de videovigilancia, empezando por Howen VSS.

## Requisitos

- Node.js 20+
- Acceso de red al servidor Howen VSS

## Configuracion

1. Copiar `.env.example` a `.env.local`
2. Completar variables:

```bash
HOWEN_BASE_URL=http://192.168.1.2:9966
HOWEN_STREAM_BASE_URL=http://192.168.1.2:33122
HOWEN_USERNAME=admin
HOWEN_PASSWORD=your_password_here
HOWEN_PASSWORD_IS_MD5=false
HOWEN_TIMEOUT_MS=15000
HOWEN_DEBUG=true
HOWEN_LOG_SENSITIVE=false
HOWEN_AUTO_REFRESH=true
HOWEN_AUTO_REFRESH_INTERVAL_MIN=25
HOWEN_SESSION_PERSIST_PATH=.runtime/howen-session.json
CV200_STREAM_BASE_URL=http://127.0.0.1:8888
CV200_INGEST_BASE_URL=http://127.0.0.1:3100
CV200_RTMP_SERVER=192.168.100.6:1935/live
```

Notas:
- Si `HOWEN_PASSWORD_IS_MD5=false`, el backend calcula MD5 automaticamente antes de loguear.
- `HOWEN_DEBUG=true` habilita logs operativos de integracion.
- `HOWEN_LOG_SENSITIVE=true` muestra token/pid completos en logs (usar solo en entornos controlados).
- `HOWEN_AUTO_REFRESH=true` renueva sesion automaticamente en segundo plano.
- `HOWEN_AUTO_REFRESH_INTERVAL_MIN=25` define cada cuantos minutos forzar renovacion.
- `HOWEN_STREAM_BASE_URL` apunta al servicio live/replay FLV (normalmente puerto `33122`).
- `HOWEN_SESSION_PERSIST_PATH` persiste token/pid/cookie para sobrevivir reinicios y evitar login excesivo.
- `CV200_STREAM_BASE_URL` apunta a MediaMTX/HLS para CV200 (por defecto local en `:8888`).
- `CV200_INGEST_BASE_URL` apunta al microservicio `cv200-ingest-service` (por defecto `:3100`).
- `CV200_RTMP_SERVER` es el destino RTMP que `sentinel` usa al pedir `start live` en CV200.

## Desarrollo

```bash
npm install
npm run dev
```

API disponible en `http://localhost:3000`.

## Endpoints

### Health

- `GET /api/health`

### Integracion Howen

- `GET /api/integrations/howen/connection`
  - Verifica login con Howen y estado de sesion.

- `GET /api/integrations/howen/devices?page=1&pageSize=50&isOnline=1&keyword=...&fleetId=...`
  - Lista dispositivos (paginado).

- `GET /api/integrations/howen/events?deviceId=99990001&beginTime=2026-03-28%2000:00:00&endTime=2026-03-29%2000:00:00&page=1&pageSize=50&alarmType=...`
  - Consulta eventos/alarms por rango.

- `GET /api/integrations/howen/recordings?deviceId=99990001&startTime=2026-03-28%2000:00:00&endTime=2026-03-29%2000:00:00&fileType=1&location=1&channelList=1;2&scheme=http`
  - Busca grabaciones/evidencias.

- `GET /api/integrations/howen/overview?deviceId=99990001&beginTime=2026-03-28%2000:00:00&endTime=2026-03-29%2000:00:00&channelList=1;2&fileType=1&location=1`
  - Trae en una sola respuesta: dispositivos, eventos y grabaciones.

- `GET /api/integrations/howen/live?deviceId=99990001&channel=1&stream=0`
  - Proxy live FLV desde backend para evitar mixed content.

### Integracion CV200 (MediaMTX)

- `GET /api/integrations/cv200/devices?all=1&fleetId=&isOnline=&keyword=`
  - Lista dispositivos CV200 mapeados al shape de dispositivos de UI.

- `GET /api/integrations/cv200/fleets`
  - Agrupa dispositivos CV200 por fleet para Live Monitor.

- `GET /api/integrations/cv200/live?path=live/cv200-1`
  - Devuelve la URL HLS proxied en backend.

- `POST /api/integrations/cv200/live/start`
  - Dispara `start pushing` en CV200 via `cv200-ingest-service`.

- `POST /api/integrations/cv200/live/stop`
  - Dispara `stop pushing` en CV200 via `cv200-ingest-service`.

- `GET /api/integrations/cv200/live/live/cv200-1/index.m3u8`
  - Proxy HLS (playlist y segmentos) desde `CV200_STREAM_BASE_URL`.

## Notas de arquitectura

- Implementacion basada en `Route Handlers` (`app/api/.../route.ts`).
- Cliente Howen desacoplado en `lib/integrations/howen/`.
- Manejo homogeneo de errores y respuestas en `lib/http/api.ts`.
- Base lista para agregar nuevos conectores (Dahua, Hikvision, etc.) sin cambiar contratos de frontend.
