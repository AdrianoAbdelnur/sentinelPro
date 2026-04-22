# Plan de Integracion CV200 en sentinel-pro

## Objetivo
- Integrar un nuevo provider backend `cv200` en `sentinel-pro`.
- Consumir `cv200-ingest-service` solo desde backend Next.js (nunca directo desde frontend).
- Mantener compatibilidad hacia atras con Howen y contratos actuales.

## Arquitectura Propuesta
1. Mantener rutas publicas actuales de Howen (`/api/integrations/howen/*`) sin cambios de contrato.
2. Agregar provider `cv200` con patron equivalente.
3. Crear capa adapter interna comun para `howen` y `cv200`.
4. Resolver provider por query (`provider`) o por config global (`DEFAULT_VIDEO_PROVIDER`).
5. Next.js actua como fachada publica; `cv200-ingest-service` queda como upstream interno.

## Fase 1 - Base Compartida y Seleccion de Provider
- Definir interfaz de provider de dominio interno.
- Implementar resolver de provider:
  - prioridad a query param explicito
  - fallback a `DEFAULT_VIDEO_PROVIDER`
  - default final: `howen`
- Preservar comportamiento actual si no se envia provider.

## Fase 2 - Cliente Interno CV200
- Crear cliente HTTP tipado usando `fetch` nativo.
- Configurar `CV200_INGEST_BASE_URL` y timeout.
- Parsear envelope estandar:
  - exito: `{ success: true, data, meta? }`
  - error: `{ success: false, error: { code, message, providerCode? } }`
- Normalizar errores de red/upstream a errores internos consistentes.

## Fase 3 - Adapter CV200
- Implementar operaciones:
  - `devices`
  - `events`
  - `overview`
  - `connection`
  - `probe`
- Operaciones no soportadas en esta fase:
  - `recordings` => error controlado `not_supported_yet`
  - `live` => error controlado `not_supported_yet`
- Incluir `source: "cv200"` y mapear payloads a forma compatible con UI actual.
- Usar defaults explicitos cuando falten campos.

## Fase 4 - API Routes Next.js
- Agregar rutas `app/api/integrations/cv200/*/route.ts`.
- Validar query params y enums con misma filosofia de Howen.
- Mantener envelope de respuesta estable para frontend.

## Fase 5 - Observabilidad y Verificacion
- Agregar logging server-side con contexto:
  - provider
  - endpoint
  - latency
  - status
- Mensajes de error accionables sin exponer datos sensibles.
- Ejecutar:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run build`

## Nota de Pruebas
- Se requieren tests minimos (parser envelope, mapeo adapter, al menos 1 route handler).
- El proyecto hoy no expone script `npm test`; se define estrategia de test antes de implementarlos.
