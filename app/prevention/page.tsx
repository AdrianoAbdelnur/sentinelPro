"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

import { EvidenceModal } from "@/app/prevention/_components/EvidenceModal";
import { FleetSummaryPanel } from "@/app/prevention/_components/FleetSummaryPanel";
import { AlarmFilterModal, type AlarmFilterOption } from "@/app/prevention/_components/AlarmFilterModal";
import { RangeModal } from "@/app/prevention/_components/RangeModal";
import { SpecialAttentionPanel } from "@/app/prevention/_components/SpecialAttentionPanel";
import { TopAlarmRankingPanel } from "@/app/prevention/_components/TopAlarmRankingPanel";
import {
  buildAttentionItemFromWsAlarm,
  buildDeviceSummary,
  buildRanking,
  extractCoords,
  extractDeviceId,
  isOnline,
  parseDateToMs,
  type AttentionItem,
  type JsonValue,
} from "@/lib/features/prevention/aggregates";
import {
  DEFAULT_SELECTED_ALARM_CODES,
  HOWEN_ALARM_CODE_OPTIONS,
} from "@/lib/features/prevention/alarm-codes";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; providerCode?: number };
};

type PagedData<T> = {
  totalCount?: number;
  totalNum?: number;
  dataList?: T[];
};

type RecordingsData = {
  files?: JsonValue[];
};

type EvidenceResponse = {
  source?: string;
  data?: JsonValue[];
};

type LeafletModule = typeof import("leaflet");

function toHowenDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  const ss = `${date.getSeconds()}`.padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function labelFromDeviceName(name: string): string {
  const parts = name.split("-");
  const last = parts[parts.length - 1]?.trim() ?? "";
  if (last) return last;
  return name.trim();
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return earthRadiusKm * c;
}

function proxiedEvidenceUrl(url: string): string {
  return `/api/integrations/howen/evidence-file?url=${encodeURIComponent(url)}`;
}

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success || !payload.data) {
    const msg = payload.error?.message ?? `La solicitud fallo con estado ${response.status}`;
    throw new Error(msg);
  }
  return payload.data;
}

async function runInBatches<TItem, TResult>(
  items: TItem[],
  worker: (item: TItem) => Promise<TResult>,
  concurrency = 6,
): Promise<TResult[]> {
  const output: TResult[] = [];
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) return;
      const item = items[current];
      const result = await worker(item);
      output.push(result);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
  return output;
}

export default function PreventionPage() {
  const DEBUG_ATENCION_ESPECIAL = true;

  const [beginTime, setBeginTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [devices, setDevices] = useState<JsonValue[]>([]);
  const [rankingCounts, setRankingCounts] = useState<Map<string, number>>(new Map());
  const [realtimeAttention, setRealtimeAttention] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("-");

  const [selectedAttention, setSelectedAttention] = useState<AttentionItem | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<JsonValue | null>(null);
  const [showOutliers, setShowOutliers] = useState(false);
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [rangeDraftBegin, setRangeDraftBegin] = useState("");
  const [rangeDraftEnd, setRangeDraftEnd] = useState("");
  const [alarmFilterOpen, setAlarmFilterOpen] = useState(false);
  const [selectedAlarmCodes, setSelectedAlarmCodes] = useState<Set<number>>(
    () => new Set(DEFAULT_SELECTED_ALARM_CODES),
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const fitBoundsDoneRef = useRef(false);

  const summary = useMemo(() => buildDeviceSummary(devices), [devices]);
  const ranking = useMemo(() => buildRanking(rankingCounts, devices), [rankingCounts, devices]);
  const deviceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const device of devices) {
      const id = extractDeviceId(device);
      if (!id) continue;
      const name = String(device.devicename ?? device.deviceName ?? "").trim();
      if (name) {
        map.set(id, name);
      }
    }
    return map;
  }, [devices]);
  const ALARM_FILTER_OPTIONS = useMemo<AlarmFilterOption[]>(
    () => HOWEN_ALARM_CODE_OPTIONS,
    [],
  );
  const specialAttention = useMemo(() => {
    const merged = [...realtimeAttention];
    const seen = new Set<string>();
    const output: AttentionItem[] = [];

    for (const item of merged) {
      const code = item.alarmCode;
      if (code === null) continue;
      if (!selectedAlarmCodes.has(code)) continue;

      const dedupeKey = `${item.alarmGuid || item.key}|${item.createdAt}|${item.alarmCode ?? "-"}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const canonicalName = deviceNameById.get(item.deviceId);
      output.push({
        ...item,
        name: canonicalName || item.name,
      });
      if (output.length >= 20) break;
    }

    return output;
  }, [realtimeAttention, selectedAlarmCodes, deviceNameById]);

  useEffect(() => {
    let mounted = true;
    const markers = markersRef.current;

    async function initMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (!mounted || !mapContainerRef.current) return;

      leafletRef.current = L;
      const map = L.map(mapContainerRef.current, {
        center: [-26.7, -65.3],
        zoom: 6,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      mapRef.current = map;
    }

    void initMap();

    return () => {
      mounted = false;
      markers.forEach((marker) => marker.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;

    const visibleIds = new Set<string>();
    const onlinePoints: Array<{ device: JsonValue; id: string; lat: number; lng: number }> = [];
    const bounds: [number, number][] = [];

    for (const device of devices) {
      if (!isOnline(device)) continue;
      const id = extractDeviceId(device);
      if (!id) continue;

      const { latitude, longitude } = extractCoords(device);
      if (latitude === null || longitude === null) continue;
      onlinePoints.push({ device, id, lat: latitude, lng: longitude });
    }

    const centroid =
      onlinePoints.length > 0
        ? {
            lat: onlinePoints.reduce((acc, p) => acc + p.lat, 0) / onlinePoints.length,
            lng: onlinePoints.reduce((acc, p) => acc + p.lng, 0) / onlinePoints.length,
          }
        : null;

    const OUTLIER_RADIUS_KM = 2000;

    for (const point of onlinePoints) {
      const { device, id, lat: latitude, lng: longitude } = point;
      if (centroid && !showOutliers) {
        const distanceKm = haversineKm({ lat: latitude, lng: longitude }, centroid);
        if (distanceKm > OUTLIER_RADIUS_KM) {
          continue;
        }
      }

      const deviceNameLabel = String(device.devicename ?? device.deviceName ?? id).trim() || id;
      const shortLabel = labelFromDeviceName(deviceNameLabel);
      const direction = toNumber(device.direct) ?? toNumber(device.direction) ?? 0;

      const icon = L.divIcon({
        className: "sentinel-truck-marker",
        html: `<div style="display:flex;align-items:center;gap:6px;">
          <div style="transform:rotate(${direction}deg);width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
            <img src="/assets/camion.png" alt="truck" style="width:28px;height:28px;object-fit:contain;" />
          </div>
          <span title="${escapeHtml(deviceNameLabel)}" style="padding:2px 6px;border-radius:8px;background:rgba(15,23,42,.9);color:#e2e8f0;font-size:11px;font-weight:700;">${escapeHtml(shortLabel)}</span>
        </div>`,
        iconSize: [80, 24],
        iconAnchor: [8, 8],
      });

      const popup = `
        <div style="font-size:12px;line-height:1.4">
          <strong>${deviceNameLabel}</strong><br/>
          ID: ${id}<br/>
          Estado: En linea<br/>
          Direccion: ${direction} deg
        </div>
      `;

      const existing = markersRef.current.get(id);
      if (existing) {
        existing.setLatLng([latitude, longitude]);
        existing.setIcon(icon);
        existing.bindPopup(popup);
      } else {
        const marker = L.marker([latitude, longitude], { icon }).addTo(mapRef.current);
        marker.bindPopup(popup);
        markersRef.current.set(id, marker);
      }

      visibleIds.add(id);
      bounds.push([latitude, longitude]);
    }

    markersRef.current.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    if (!fitBoundsDoneRef.current && bounds.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 });
      fitBoundsDoneRef.current = true;
    }
  }, [devices, showOutliers]);

  const loadData = useCallback(async () => {
    if (!beginTime || !endTime) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const devicesData = await fetchApi<PagedData<JsonValue>>("/api/integrations/howen/devices?all=1");
      const allDevices = devicesData.dataList ?? [];
      setDevices(allDevices);

      const candidates = allDevices
        .filter((device) => isOnline(device))
        .map((device) => extractDeviceId(device))
        .filter((id) => id);

      const counts = new Map<string, number>();
      await runInBatches(
        candidates,
        async (deviceId) => {
          const params = new URLSearchParams({
            deviceId,
            beginTime,
            endTime,
            page: "1",
            pageSize: "1",
          });
          const response = await fetchApi<PagedData<JsonValue>>(
            `/api/integrations/howen/events?${params.toString()}`,
          );
          const total = Number(response.totalCount ?? response.totalNum ?? 0);
          counts.set(deviceId, Number.isFinite(total) ? total : 0);
          return null;
        },
        8,
      );

      setRankingCounts(counts);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar prevencion");
    } finally {
      setLoading(false);
    }
  }, [beginTime, endTime]);

  useEffect(() => {
    if (beginTime && endTime) {
      return;
    }
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const begin = toHowenDate(start);
    const finish = toHowenDate(end);
    setBeginTime(begin);
    setEndTime(finish);
    setRangeDraftBegin(begin);
    setRangeDraftEnd(finish);
  }, [beginTime, endTime]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const source = new EventSource("/api/integrations/howen/alarm-stream");

    const onAlarm = (event: MessageEvent) => {
      try {
        const receivedAtIso = new Date().toISOString();
        if (DEBUG_ATENCION_ESPECIAL) {
          console.groupCollapsed(`[Atencion especial] Alarma recibida ${receivedAtIso}`);
          console.log("Evento SSE crudo (event.data):", event.data);
        }

        const wsMessage = JSON.parse(event.data) as JsonValue;
        const payload = (wsMessage.payload ?? {}) as JsonValue;
        const detailPayload = (payload.payload ?? {}) as JsonValue;
        const ec = Number(detailPayload.ec);
        const ecText = Number.isFinite(ec) ? String(ec) : "-";

        if (DEBUG_ATENCION_ESPECIAL) {
          console.log(`EC detectado: ${ecText}`);
          console.log("Mensaje WebSocket parseado completo:", wsMessage);
          console.log("wsMessage.payload:", payload);
          console.log("wsMessage.payload.payload:", detailPayload);
        }

        const item = buildAttentionItemFromWsAlarm(wsMessage, devices);
        if (DEBUG_ATENCION_ESPECIAL) {
          console.log("Item normalizado para UI:", item);
        }
        if (!item) {
          if (DEBUG_ATENCION_ESPECIAL) {
            console.warn("Descartada: no se pudo normalizar la alarma.");
            console.groupEnd();
          }
          return;
        }

        if (item.alarmCode === null) {
          if (DEBUG_ATENCION_ESPECIAL) {
            console.warn("Descartada: alarmCode nulo.");
            console.groupEnd();
          }
          return;
        }

        if (!selectedAlarmCodes.has(item.alarmCode)) {
          if (DEBUG_ATENCION_ESPECIAL) {
            console.warn(
              `Descartada por filtro: alarmCode=${item.alarmCode} no esta en seleccionados.`,
            );
            console.log("Codigos de alarma seleccionados:", Array.from(selectedAlarmCodes));
            console.groupEnd();
          }
          return;
        }

        setRealtimeAttention((prev) => {
          const next = [item, ...prev];
          const seen = new Set<string>();
          const deduped: AttentionItem[] = [];
          for (const row of next) {
            const key = `${row.alarmGuid || row.key}|${row.createdAt}|${row.alarmCode ?? "-"}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(row);
            if (deduped.length >= 20) break;
          }
          if (DEBUG_ATENCION_ESPECIAL) {
            console.log("Resultado: alarma agregada a Atencion especial.");
            console.log("Total en lista (post-dedupe):", deduped.length);
            console.groupEnd();
          }
          return deduped;
        });
      } catch (error) {
        if (DEBUG_ATENCION_ESPECIAL) {
          console.error("Error parseando/procesando alarma SSE:", error);
          console.groupEnd();
        }
        // Ignore malformed realtime event payloads.
      }
    };

    source.addEventListener("alarm", onAlarm);

    return () => {
      source.removeEventListener("alarm", onAlarm);
      source.close();
    };
  }, [devices, selectedAlarmCodes]);

  function toggleAlarmCode(code: number, checked: boolean) {
    setSelectedAlarmCodes((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
    setRealtimeAttention((prev) =>
      prev.filter((item) => item.alarmCode !== null && (checked ? true : item.alarmCode !== code)),
    );
  }

  async function openEvidence(item: AttentionItem) {
    setSelectedAttention(item);
    setSelectedRecording(null);
    setEvidenceError(null);
    setEvidenceLoading(true);
    setEvidenceOpen(true);

    try {
      if (item.evidenceUrl) {
        setSelectedRecording({
          downUrl: proxiedEvidenceUrl(item.evidenceUrl),
          start: item.evidenceStart,
          stop: item.evidenceStop,
          path: item.evidencePath,
          fileType: item.evidenceFileType,
        });
        return;
      }

      const createdAtMs = parseDateToMs(item.createdAt);
      const center = createdAtMs > 0 ? new Date(createdAtMs) : new Date();
      const start = new Date(center.getTime() - 5 * 60 * 1000);
      const end = new Date(center.getTime() + 5 * 60 * 1000);

      const evidenceParams = new URLSearchParams({
        conditionName: item.deviceId,
        startTime: toHowenDate(start),
        endTime: toHowenDate(end),
        scheme: "http",
      });
      const evidence = await fetchApi<EvidenceResponse>(
        `/api/integrations/howen/evidence?${evidenceParams.toString()}`,
      );
      const byGuid = (evidence.data ?? []).find((row) => {
        const guid = String(row.alarmGuid ?? row.guid ?? "").trim();
        return item.alarmGuid && guid === item.alarmGuid;
      });
      const files = Array.isArray(byGuid?.alarmFile) ? (byGuid.alarmFile as JsonValue[]) : [];
      const pickedFile =
        files.find((file) => String(file.fileType ?? "") === "2") ??
        files.find((file) => String(file.fileType ?? "") === "4") ??
        files[0] ??
        null;
      const evidenceUrl = String(pickedFile?.downUrl ?? pickedFile?.downurl ?? "").trim();
      if (evidenceUrl) {
        setSelectedRecording({
          downUrl: proxiedEvidenceUrl(evidenceUrl),
          start: String(pickedFile?.fileStartTime ?? ""),
          stop: String(pickedFile?.fileStopTime ?? ""),
          path: String(pickedFile?.filePath ?? ""),
          fileType: String(pickedFile?.fileType ?? ""),
        });
        return;
      }

      const alarmVideoParams = new URLSearchParams({
        deviceId: item.deviceId,
        startTime: toHowenDate(start),
        endTime: toHowenDate(end),
        channelList: String(item.channel),
        fileType: "2",
        location: "4",
        scheme: "http",
      });

      let recordings = await fetchApi<RecordingsData>(
        `/api/integrations/howen/recordings?${alarmVideoParams.toString()}`,
      );
      let picked = recordings.files?.[0] ?? null;

      if (!picked) {
        const fallbackParams = new URLSearchParams({
          deviceId: item.deviceId,
          startTime: toHowenDate(start),
          endTime: toHowenDate(end),
          channelList: String(item.channel),
          fileType: "1",
          location: "1",
          scheme: "http",
        });
        recordings = await fetchApi<RecordingsData>(
          `/api/integrations/howen/recordings?${fallbackParams.toString()}`,
        );
        picked = recordings.files?.[0] ?? null;
      }

      if (picked?.downUrl || picked?.downurl) {
        setSelectedRecording({
          ...picked,
          downUrl: proxiedEvidenceUrl(String(picked.downUrl ?? picked.downurl ?? "").trim()),
        });
      } else {
        setSelectedRecording(picked);
      }
      if (!picked) {
        setEvidenceError("No hay grabacion para la ventana seleccionada.");
      }
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : "No se pudo cargar evidencia.");
    } finally {
      setEvidenceLoading(false);
    }
  }

  function applyRangeFromModal() {
    if (!rangeDraftBegin.trim() || !rangeDraftEnd.trim()) {
      setError("Debes completar beginTime y endTime.");
      return;
    }
    setBeginTime(rangeDraftBegin.trim());
    setEndTime(rangeDraftEnd.trim());
    setRangeModalOpen(false);
  }

  return (
    <main className="relative h-[calc(100vh-65px)] overflow-hidden bg-slate-950 text-slate-100">
      <div
        ref={mapContainerRef}
        className="absolute inset-0 z-0"
      />
      <section className="pointer-events-none absolute left-4 top-4 z-20 w-[320px] space-y-3">
        <FleetSummaryPanel
          summary={summary}
          loading={loading}
          error={error}
          lastRefresh={lastRefresh}
          showOutliers={showOutliers}
          onToggleOutliers={setShowOutliers}
          onRefresh={() => void loadData()}
        />
      </section>

      <section className="pointer-events-none absolute right-4 top-4 z-20 grid h-[calc(100vh-97px)] w-[390px] grid-rows-2 gap-3">
        <TopAlarmRankingPanel
          beginTime={beginTime}
          endTime={endTime}
          ranking={ranking}
          onOpenRange={() => {
            setRangeDraftBegin(beginTime);
            setRangeDraftEnd(endTime);
            setRangeModalOpen(true);
          }}
        />
        <SpecialAttentionPanel
          items={specialAttention}
          onOpenEvidence={(item) => void openEvidence(item)}
          onOpenFilters={() => setAlarmFilterOpen(true)}
        />
      </section>

      <RangeModal
        open={rangeModalOpen}
        beginValue={rangeDraftBegin}
        endValue={rangeDraftEnd}
        onBeginChange={setRangeDraftBegin}
        onEndChange={setRangeDraftEnd}
        onClose={() => setRangeModalOpen(false)}
        onApply={applyRangeFromModal}
      />

      <AlarmFilterModal
        open={alarmFilterOpen}
        options={ALARM_FILTER_OPTIONS}
        selectedCodes={selectedAlarmCodes}
        onToggleCode={toggleAlarmCode}
        onClose={() => setAlarmFilterOpen(false)}
      />

      <EvidenceModal
        open={evidenceOpen}
        item={selectedAttention}
        recording={selectedRecording}
        loading={evidenceLoading}
        error={evidenceError}
        onClose={() => setEvidenceOpen(false)}
      />
    </main>
  );
}
