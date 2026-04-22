"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; providerCode?: number };
};

type PagedData<T> = {
  totalCount?: number;
  dataList?: T[];
};

type JsonValue = Record<string, unknown>;

type FleetSummary = {
  source?: string;
  fleetKey: string;
  fleetId: string | null;
  fleetLabel: string;
  totalCount: number;
  onlineCount: number;
  offlineCount: number;
};

type FleetSummaryData = {
  source?: string;
  totalCount?: number;
  totalDevices?: number;
  dataList?: FleetSummary[];
};

type FleetGroup = {
  summary: FleetSummary;
  devices: JsonValue[];
  isOpen: boolean;
  isLoading: boolean;
};

type LeafletModule = typeof import("leaflet");
type DeviceStatusItem = {
  deviceguid?: string;
  deviceName?: string;
  recordState?: number | string;
  recordstate?: number | string;
  videoMaskState?: number | string;
  videomaskstate?: number | string;
  videoLostState?: number | string;
  videoloststate?: number | string;
  stateJson?: string;
};

type DeviceStatusApiData = {
  source?: string;
  data?: DeviceStatusItem[];
};

type GridSlot = {
  key: string;
  deviceId: string;
  channel: number;
  label: string;
  url: string;
  provider: "howen" | "cv200";
};

function extractDeviceId(item: JsonValue): string {
  const candidates = [item.deviceid, item.deviceID, item.deviceNo, item.deviceno, item.deviceguid];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && value !== "-") {
      return value;
    }
  }
  return "";
}

function deviceProvider(item: JsonValue): "howen" | "cv200" {
  const source = String(item.source ?? item.provider ?? "").trim().toLowerCase();
  return source === "cv200" ? "cv200" : "howen";
}

function extractPlate(item: JsonValue): string {
  const candidates = [item.plateNo, item.plateno, item.plateNO, item.plate];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && value !== "-") {
      return value;
    }
  }
  return "";
}

function extractFleet(item: JsonValue): string {
  return (
    String(item.fleetname ?? item.fleetName ?? item.fleetid ?? item.fleetId ?? "").trim() ||
    "Sin flota"
  );
}

function extractFleetId(item: JsonValue): string {
  return String(item.fleetid ?? item.fleetId ?? "").trim();
}

function extractNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cv200TelemetryOnline(item: JsonValue): boolean {
  if (typeof item.isOnline === "boolean") {
    return item.isOnline;
  }
  const mode = extractNumber(item.accessmode);
  return mode !== null && mode >= 1;
}

function isOnline(value: unknown, item?: JsonValue): boolean {
  if (item && deviceProvider(item) === "cv200") {
    return cv200TelemetryOnline(item);
  }
  const mode = extractNumber(value);
  return mode !== null && mode >= 1;
}

function statusText(item: JsonValue, effectiveOnline?: boolean): string {
  if (deviceProvider(item) === "cv200") {
    return effectiveOnline ? "En linea" : "Desconectado";
  }

  const mode = extractNumber(item.accessmode);
  if (mode === -1) return "Desconectado";
  if (mode === 1) return "En linea - Ethernet";
  if (mode === 2) return "En linea - WiFi";
  if (mode === 3) return "En linea - 2G";
  if (mode === 4) return "En linea - 3G";
  if (mode === 5) return "En linea - 4G";
  if (mode === 6) return "En linea - 5G";
  if (mode === 7) return "En linea - WiFi + 3/4/5G";
  if (mode === 8) return "En linea - Cable + 3/4/5G";
  return "Desconocido";
}

function deviceMatchesQuery(device: JsonValue, query: string): boolean {
  if (!query) {
    return true;
  }

  const id = extractDeviceId(device).toLowerCase();
  const plate = extractPlate(device).toLowerCase();
  const name = String(device.devicename ?? device.deviceName ?? "").toLowerCase();
  return id.includes(query) || plate.includes(query) || name.includes(query);
}

function extractChannels(item: JsonValue): number[] {
  const raw = String(item.channelname ?? item.channelName ?? "").trim();
  const byName = raw
    ? raw
        .split(";")
        .map((part) => {
          const match = part.match(/(\d+)/);
          return match?.[1] ? Number.parseInt(match[1], 10) : NaN;
        })
        .filter((n) => Number.isFinite(n) && n >= 1)
    : [];

  if (byName.length > 0) {
    return Array.from(new Set(byName)).sort((a, b) => a - b);
  }

  const count = Number(item.videoencodernumber ?? 0);
  if (Number.isFinite(count) && count > 0) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  return [1];
}

function parseMaskValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("0x")) {
    const n = Number.parseInt(raw.slice(2), 16);
    return Number.isFinite(n) ? n : null;
  }
  const decimal = Number.parseInt(raw, 10);
  return Number.isFinite(decimal) ? decimal : null;
}

function bitIsSet(mask: number | null, channel: number): boolean {
  if (mask === null || channel < 1) return false;
  const bit = channel - 1;
  return (mask & (1 << bit)) !== 0;
}

function parseFormatterChannels(value: unknown): Set<number> {
  const set = new Set<number>();
  const raw = String(value ?? "").trim();
  if (!raw) return set;
  const matches = raw.matchAll(/ch\s*(\d+)/gi);
  for (const match of matches) {
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n) && n >= 1) {
      set.add(n);
    }
  }
  return set;
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...(init ?? {}) });
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success || !payload.data) {
    const msg = payload.error?.message ?? `La solicitud fallo con estado ${response.status}`;
    throw new Error(msg);
  }
  return payload.data;
}

function resolveCv200Path(deviceId: string): string {
  if (deviceId.toUpperCase() === "CV200") {
    return "live/cv200-1";
  }
  return `live/${deviceId}-1`;
}

function Cv200HlsPlayer({
  url,
  className,
}: {
  url: string;
  className: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showLoading, setShowLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const videoElement = videoRef.current;
    let hlsInstance: {
      destroy: () => void;
      loadSource: (source: string) => void;
      attachMedia: (video: HTMLMediaElement) => void;
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      startLoad?: () => void;
      recoverMediaError?: () => void;
    } | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let healthTimer: ReturnType<typeof setInterval> | null = null;
    let loadingTimer: ReturnType<typeof setTimeout> | null = null;
    let lastProgressAt = Date.now();

    const clearTimers = (): void => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }
      if (loadingTimer) {
        clearTimeout(loadingTimer);
        loadingTimer = null;
      }
    };

    const cleanupPlayer = (): void => {
      hlsInstance?.destroy();
      hlsInstance = null;
      if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute("src");
        videoElement.load();
      }
    };

    const scheduleReconnect = (delayMs: number): void => {
      if (cancelled || retryTimer) {
        return;
      }
      if (!loadingTimer) {
        loadingTimer = setTimeout(() => {
          if (!cancelled) {
            setShowLoading(true);
          }
        }, 3000);
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void mount();
      }, delayMs);
    };

    async function mount(): Promise<void> {
      const video = videoElement;
      if (!video) {
        return;
      }

      cleanupPlayer();
      clearTimers();
      setShowLoading(true);
      lastProgressAt = Date.now();
      const sourceUrl = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
      video.muted = true;
      video.ontimeupdate = () => {
        lastProgressAt = Date.now();
      };
      video.onplaying = () => {
        if (loadingTimer) {
          clearTimeout(loadingTimer);
          loadingTimer = null;
        }
        setShowLoading(false);
        lastProgressAt = Date.now();
      };
      video.onstalled = () => {
        scheduleReconnect(1200);
      };
      video.onerror = () => {
        scheduleReconnect(1200);
      };

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = sourceUrl;
        try {
          await video.play();
        } catch {
          scheduleReconnect(1200);
        }
        healthTimer = setInterval(() => {
          if (Date.now() - lastProgressAt > 10_000) {
            scheduleReconnect(1200);
          }
        }, 4_000);
        return;
      }

      try {
        const hlsModule = await import("hls.js");
        const Hls = hlsModule.default as unknown as {
          new (config?: Record<string, unknown>): {
            destroy: () => void;
            loadSource: (source: string) => void;
            attachMedia: (video: HTMLMediaElement) => void;
            on: (event: string, cb: (...args: unknown[]) => void) => void;
            startLoad?: () => void;
            recoverMediaError?: () => void;
          };
          isSupported: () => boolean;
          Events: Record<string, string>;
          ErrorTypes: Record<string, string>;
        };
        if (cancelled || !videoElement) {
          return;
        }

        if (!Hls.isSupported()) {
          setShowLoading(true);
          return;
        }

        hlsInstance = new Hls({
          lowLatencyMode: true,
          backBufferLength: 10,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
        });
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, async () => {
          try {
            await videoElement.play();
          } catch {
            scheduleReconnect(1200);
          }
        });
        hlsInstance.on(Hls.Events.FRAG_LOADED, () => {
          if (loadingTimer) {
            clearTimeout(loadingTimer);
            loadingTimer = null;
          }
          setShowLoading(false);
          lastProgressAt = Date.now();
        });
        hlsInstance.on(Hls.Events.ERROR, (_event, data: unknown) => {
          const payload = data as { fatal?: boolean; type?: string };
          if (!payload?.fatal) {
            return;
          }
          if (payload.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hlsInstance?.startLoad?.();
            scheduleReconnect(1200);
            return;
          }
          if (payload.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hlsInstance?.recoverMediaError?.();
            scheduleReconnect(1200);
            return;
          }
          scheduleReconnect(1200);
        });
        hlsInstance.loadSource(sourceUrl);
        hlsInstance.attachMedia(videoElement);
        healthTimer = setInterval(() => {
          if (Date.now() - lastProgressAt > 10_000) {
            scheduleReconnect(1200);
          }
        }, 4_000);
      } catch {
        scheduleReconnect(1500);
      }
    }

    void mount();

    return () => {
      cancelled = true;
      clearTimers();
      cleanupPlayer();
    };
  }, [url]);

  return (
    <div className={`${className} relative w-full bg-black`}>
      <video ref={videoRef} className="h-full w-full bg-black object-contain" controls autoPlay muted />
      {showLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-2 text-center text-sm text-slate-100">
          Cargando video...
        </div>
      )}
    </div>
  );
}

export default function LivePage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const leafletRef = useRef<LeafletModule | null>(null);
  const fitBoundsSignatureRef = useRef("");
  const expandedFleetsRef = useRef<Record<string, boolean>>({});
  const fleetSummariesRef = useRef<FleetSummary[]>([]);
  const fleetDevicesRef = useRef<Record<string, JsonValue[]>>({});
  const gridSlotsRef = useRef<GridSlot[]>([]);

  const [fleetSummaries, setFleetSummaries] = useState<FleetSummary[]>([]);
  const [fleetDevices, setFleetDevices] = useState<Record<string, JsonValue[]>>({});
  const [fleetLoading, setFleetLoading] = useState<Record<string, boolean>>({});
  const [totalDevices, setTotalDevices] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [expandedFleets, setExpandedFleets] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("-");
  const [modalStream, setModalStream] = useState<0 | 1>(0);
  const [gridSize, setGridSize] = useState<4 | 9 | 16>(4);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridMessage, setGridMessage] = useState<string | null>(null);
  const [gridSlots, setGridSlots] = useState<GridSlot[]>([]);
  const [cv200StreamActiveByDevice, setCv200StreamActiveByDevice] = useState<Record<string, boolean>>({});

  useEffect(() => {
    expandedFleetsRef.current = expandedFleets;
  }, [expandedFleets]);

  useEffect(() => {
    fleetSummariesRef.current = fleetSummaries;
  }, [fleetSummaries]);

  useEffect(() => {
    fleetDevicesRef.current = fleetDevices;
  }, [fleetDevices]);

  useEffect(() => {
    gridSlotsRef.current = gridSlots;
  }, [gridSlots]);

  const loadedDevices = useMemo(() => {
    return Object.values(fleetDevices).flat();
  }, [fleetDevices]);

  const selectedDevices = useMemo(() => {
    return loadedDevices.filter((device) => selectedIds[extractDeviceId(device)]);
  }, [loadedDevices, selectedIds]);

  useEffect(() => {
    let cancelled = false;

    const refreshCv200StreamStatus = async (): Promise<void> => {
      const cv200Devices = loadedDevices.filter((device) => deviceProvider(device) === "cv200");
      const ids = Array.from(
        new Set(
          cv200Devices
            .map((device) => extractDeviceId(device))
            .filter((deviceId) => deviceId.length > 0)
        )
      );

      if (ids.length === 0) {
        if (!cancelled) {
          setCv200StreamActiveByDevice({});
        }
        return;
      }

      const pairs = await Promise.all(
        ids.map(async (deviceId) => {
          try {
            const data = await fetchApi<{ active: boolean }>(
              `/api/integrations/cv200/stream-status?deviceId=${encodeURIComponent(deviceId)}`
            );
            return [deviceId, Boolean(data.active)] as const;
          } catch {
            return [deviceId, false] as const;
          }
        })
      );

      if (!cancelled) {
        setCv200StreamActiveByDevice(Object.fromEntries(pairs));
      }
    };

    void refreshCv200StreamStatus();
    const interval = setInterval(() => {
      void refreshCv200StreamStatus();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadedDevices]);

  const groupedDevices = useMemo(() => {
    const filter = query.trim().toLowerCase();
    const visibleGroups: FleetGroup[] = [];

    for (const summary of fleetSummaries) {
      if (onlyOnline && summary.onlineCount === 0 && summary.source !== "cv200") {
        continue;
      }

      const isOpen = Boolean(expandedFleets[summary.fleetKey]);
      const isLoading = Boolean(fleetLoading[summary.fleetKey]);
      const fleetIdFilter = (summary.fleetId ?? "").toLowerCase();
      const fleetLabelFilter = summary.fleetLabel.toLowerCase();
      const fleetMatches = !filter || fleetLabelFilter.includes(filter) || fleetIdFilter.includes(filter);

      const loaded = fleetDevices[summary.fleetKey] ?? [];
      const visibleDevices = isOpen
        ? loaded.filter((device) => {
            const provider = deviceProvider(device);
            const deviceId = extractDeviceId(device);
            const effectiveOnline =
              provider === "cv200"
                ? cv200TelemetryOnline(device) || Boolean(cv200StreamActiveByDevice[deviceId])
                : isOnline(device.accessmode, device);

            if (onlyOnline && !effectiveOnline) {
              return false;
            }
            return deviceMatchesQuery(device, filter);
          })
        : [];

      if (filter && !fleetMatches && visibleDevices.length === 0) {
        continue;
      }

      visibleGroups.push({
        summary,
        devices: visibleDevices,
        isOpen,
        isLoading,
      });
    }

    return visibleGroups;
  }, [
    cv200StreamActiveByDevice,
    expandedFleets,
    fleetDevices,
    fleetLoading,
    fleetSummaries,
    onlyOnline,
    query,
  ]);

  useEffect(() => {
    let mounted = true;
    const markers = markersRef.current;

    async function initMap() {
      if (!mapContainerRef.current || mapRef.current) {
        return;
      }

      const L = await import("leaflet");
      if (!mounted || !mapContainerRef.current) {
        return;
      }

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
    if (!mapRef.current || !leafletRef.current) {
      return;
    }

    const L = leafletRef.current;
    const selectedSet = new Set(selectedDevices.map((d) => extractDeviceId(d)));
    const bounds: [number, number][] = [];

    for (const device of selectedDevices) {
      const id = extractDeviceId(device);
      if (!id) continue;

      const lat = extractNumber(device.latitude);
      const lng = extractNumber(device.longitude);
      if (lat === null || lng === null) {
        continue;
      }

      const direction = extractNumber(device.direct) ?? 0;
      const speed = extractNumber(device.speed) ?? 0;
      const plate = extractPlate(device);
      const name = String(device.devicename ?? device.deviceName ?? "-");

      const icon = L.divIcon({
        className: "sentinel-truck-marker",
        html: `<div style="transform: rotate(${direction}deg);"><img src="/assets/camion.png" alt="truck" style="width:28px;height:28px;object-fit:contain;" /></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const popup = `
        <div style="font-size:12px;line-height:1.4">
          <strong>${name}</strong><br/>
          ID: ${id}<br/>
          Patente: ${plate || "-"}<br/>
          Velocidad: ${speed} km/h<br/>
          Direccion: ${direction} deg
        </div>
      `;

      const existing = markersRef.current.get(id);
      if (existing) {
        existing.setLatLng([lat, lng]);
        existing.setIcon(icon);
        existing.bindPopup(popup);
      } else {
        const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current);
        marker.bindPopup(popup);
        markersRef.current.set(id, marker);
      }

      bounds.push([lat, lng]);
    }

    markersRef.current.forEach((marker, id) => {
      if (!selectedSet.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    const signature = Array.from(selectedSet).sort().join("|");
    if (!signature) {
      fitBoundsSignatureRef.current = "";
      return;
    }

    if (bounds.length > 0 && signature !== fitBoundsSignatureRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      fitBoundsSignatureRef.current = signature;
    }
  }, [selectedDevices]);

  async function loadFleetSummaries(options?: { silent?: boolean }) {
    try {
      const [howenResult, cv200Result] = await Promise.allSettled([
        fetchApi<FleetSummaryData>("/api/integrations/howen/fleets"),
        fetchApi<FleetSummaryData>("/api/integrations/cv200/fleets"),
      ]);

      const howenList =
        howenResult.status === "fulfilled"
          ? (howenResult.value.dataList ?? []).map((item) => ({ ...item, source: "howen" }))
          : [];
      const cv200List =
        cv200Result.status === "fulfilled"
          ? (cv200Result.value.dataList ?? []).map((item) => ({ ...item, source: "cv200" }))
          : [];

      const list = [...howenList, ...cv200List];
      setFleetSummaries(list);
      const howenDevices =
        howenResult.status === "fulfilled" ? (howenResult.value.totalDevices ?? 0) : 0;
      const cv200Devices =
        cv200Result.status === "fulfilled" ? (cv200Result.value.totalDevices ?? 0) : 0;
      setTotalDevices(howenDevices + cv200Devices);
      if (!options?.silent) {
        setError(null);
      }

      if (howenResult.status === "rejected" && cv200Result.status === "rejected") {
        throw new Error("No se pudieron cargar grupos de Howen ni CV200.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los grupos");
    }
  }

  const loadFleetDevices = useCallback(
    async (summary: FleetSummary, options?: { force?: boolean; silent?: boolean }) => {
      if (!options?.force && fleetDevicesRef.current[summary.fleetKey]) {
        return;
      }

      setFleetLoading((prev) => ({ ...prev, [summary.fleetKey]: true }));

      try {
        const basePath =
          summary.source === "cv200"
            ? "/api/integrations/cv200/devices?all=1"
            : "/api/integrations/howen/devices?all=1";
        const path = summary.fleetId
          ? `${basePath}&fleetId=${encodeURIComponent(summary.fleetId)}`
          : basePath;

        const data = await fetchApi<PagedData<JsonValue>>(path);
        const loadedDevicesForFleet = (data.dataList ?? []).filter((device) => {
          if (!summary.fleetId) {
            return !extractFleetId(device) && extractFleet(device) === summary.fleetLabel;
          }
          return extractFleetId(device) === summary.fleetId;
        });

        setFleetDevices((prev) => {
          const next = {
            ...prev,
            [summary.fleetKey]: loadedDevicesForFleet,
          };
          fleetDevicesRef.current = next;
          return next;
        });

        if (!options?.silent) {
          setError(null);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `No se pudieron cargar dispositivos del grupo ${summary.fleetLabel}`,
        );
      } finally {
        setFleetLoading((prev) => ({ ...prev, [summary.fleetKey]: false }));
      }
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    let running = false;

    async function refreshLiveData() {
      if (!mounted || running) {
        return;
      }
      running = true;

      try {
        await loadFleetSummaries({ silent: true });

        const summariesByKey = new Map(
          fleetSummariesRef.current.map((summary) => [summary.fleetKey, summary]),
        );

        const openSummaries = Object.entries(expandedFleetsRef.current)
          .filter(([, isOpen]) => isOpen)
          .map(([fleetKey]) => summariesByKey.get(fleetKey))
          .filter((summary): summary is FleetSummary => Boolean(summary));

        await Promise.all(
          openSummaries.map(async (summary) => {
            await loadFleetDevices(summary, { force: true, silent: true });
          }),
        );

        if (mounted) {
          setLastRefresh(new Date().toLocaleTimeString());
        }
      } finally {
        running = false;
      }
    }

    void refreshLiveData();
    const interval = setInterval(() => {
      void refreshLiveData();
    }, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [loadFleetDevices]);

  function toggleDevice(id: string, checked: boolean) {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  }

  function toggleFleet(summary: FleetSummary) {
    const nextOpen = !expandedFleets[summary.fleetKey];
    setExpandedFleets((prev) => ({ ...prev, [summary.fleetKey]: nextOpen }));

    if (nextOpen && !fleetDevices[summary.fleetKey] && !fleetLoading[summary.fleetKey]) {
      void loadFleetDevices(summary);
    }
  }

  async function addDeviceToGrid(device: JsonValue) {
    const provider = deviceProvider(device);
    const availableSlots = gridSize - gridSlots.length;
    if (availableSlots <= 0) {
      setGridMessage("La grilla esta completa. Libera un espacio o limpia la grilla.");
      return;
    }

    const deviceId = extractDeviceId(device);
    if (!deviceId) {
      setError("No se pudo determinar el ID del dispositivo.");
      return;
    }

    const effectiveOnline =
      provider === "cv200"
        ? cv200TelemetryOnline(device) || Boolean(cv200StreamActiveByDevice[deviceId])
        : isOnline(device.accessmode, device);

    if (!effectiveOnline) {
      setError("El dispositivo esta desconectado. Solo se pueden agregar dispositivos en linea.");
      return;
    }

    if (provider === "cv200") {
      const key = `cv200-${deviceId}-1`;
      if (gridSlots.some((slot) => slot.key === key)) {
        setGridMessage("Ese dispositivo CV200 ya esta en la grilla.");
        return;
      }

      try {
        await fetchApi<{ action: string }>(`/api/integrations/cv200/live/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId,
            channel: 1,
            streamingType: 0,
            pushingTimeoutSec: 600,
            pushingAudio: 0,
          }),
        });

        const path = resolveCv200Path(deviceId);
        const data = await fetchApi<{ hlsUrl: string }>(
          `/api/integrations/cv200/live?path=${encodeURIComponent(path)}`,
        );

        setGridSlots((prev) =>
          [
            ...prev,
            {
              key,
              deviceId,
              channel: 1,
              label: extractPlate(device) || String(device.devicename ?? device.deviceName ?? deviceId),
              url: data.hlsUrl,
              provider: "cv200" as const,
            },
          ].slice(0, gridSize),
        );
        setGridMessage(`Transmision CV200 agregada para ${deviceId}.`);
      } catch (error) {
        setGridMessage(
          error instanceof Error
            ? `Esperando disponibilidad de transmision CV200... (${error.message})`
            : "Esperando disponibilidad de transmision CV200..."
        );
      }
      return;
    }

    const channels = extractChannels(device);
    if (channels.length === 0) {
      setGridMessage("El dispositivo no tiene canales configurados.");
      return;
    }

    setGridLoading(true);
    setGridMessage(`Buscando canales con video para ${extractPlate(device) || deviceId}...`);
    setError(null);

    const existing = new Set(gridSlots.map((slot) => slot.key));
    const channelsWithVideo: number[] = [];

    let statusItem: DeviceStatusItem | null = null;
    try {
      const statusData = await fetchApi<DeviceStatusApiData>(
        `/api/integrations/howen/device-status?deviceId=${encodeURIComponent(deviceId)}`,
      );
      statusItem = statusData.data?.[0] ?? null;
    } catch {
      statusItem = null;
    }

    const lostMask = parseMaskValue(statusItem?.videoLostState ?? statusItem?.videoloststate);
    const maskMask = parseMaskValue(statusItem?.videoMaskState ?? statusItem?.videomaskstate);
    const recordMask = parseMaskValue(statusItem?.recordState ?? statusItem?.recordstate);
    const recordFormatter = parseFormatterChannels((statusItem as JsonValue)?.recordstateFormatter);
    const lostFormatter = parseFormatterChannels((statusItem as JsonValue)?.videoloststateFormatter);
    const maskFormatter = parseFormatterChannels((statusItem as JsonValue)?.videomaskstateFormatter);
    const hasStatusBits = lostMask !== null || maskMask !== null || recordMask !== null;

    for (const channel of channels) {
      const key = `${deviceId}-${channel}`;
      if (existing.has(key)) {
        continue;
      }

      if (hasStatusBits) {
        const lost = bitIsSet(lostMask, channel) || lostFormatter.has(channel);
        const masked = bitIsSet(maskMask, channel) || maskFormatter.has(channel);
        const recordingKnown = recordMask !== null || recordFormatter.size > 0;
        const recording = bitIsSet(recordMask, channel) || recordFormatter.has(channel);

        if (!lost && !masked && (recordingKnown ? recording : true)) {
          channelsWithVideo.push(channel);
        }
      }
    }

    if (channelsWithVideo.length === 0) {
      for (const channel of channels) {
        const key = `${deviceId}-${channel}`;
        if (existing.has(key)) {
          continue;
        }
        try {
          const probe = await fetchApi<{ hasVideo: boolean }>(
            `/api/integrations/howen/probe?deviceId=${encodeURIComponent(
              deviceId,
            )}&channel=${channel}&stream=${modalStream}&timeoutMs=2500`,
          );
          if (probe.hasVideo) {
            channelsWithVideo.push(channel);
          }
        } catch {
          // ignore
        }
      }
    }

    if (channelsWithVideo.length === 0) {
      setGridLoading(false);
      setGridMessage(
        hasStatusBits
          ? "No se encontraron canales con video segun estado del dispositivo."
          : "No se pudo determinar estado de video por canal.",
      );
      return;
    }

    const toAppend = channelsWithVideo.slice(0, availableSlots);
    const builtSlots: GridSlot[] = [];
    for (const channel of toAppend) {
      const params = new URLSearchParams({
        deviceId,
        chs: String(channel),
        stream: String(modalStream),
        wnum: "1",
        panel: "0",
        buffer: "2000",
      });
      try {
        const data = await fetchApi<{ url: string }>(
          `/api/integrations/howen/realvideo?${params.toString()}`,
        );
        builtSlots.push({
          key: `${deviceId}-${channel}`,
          deviceId,
          channel,
          label: extractPlate(device) || String(device.devicename ?? device.deviceName ?? deviceId),
          url: data.url,
          provider: "howen",
        });
      } catch {
        // Skip invalid channel URL generation.
      }
    }

    if (builtSlots.length === 0) {
      setGridLoading(false);
      setGridMessage("No se pudieron generar canales reproducibles.");
      return;
    }

    setGridSlots((prev) => [...prev, ...builtSlots].slice(0, gridSize));
    setGridLoading(false);
    setGridMessage(
      `Agregados ${builtSlots.length} canal(es).${
        channelsWithVideo.length > builtSlots.length
          ? " Algunos canales quedaron fuera por falta de espacio."
          : ""
      }`,
    );
  }

  function removeGridSlot(key: string) {
    setGridSlots((prev) => prev.filter((slot) => slot.key !== key));
  }

  function clearGrid() {
    setGridSlots([]);
    setGridMessage(null);
  }

  useEffect(() => {
    const currentSlots = gridSlotsRef.current;
    if (currentSlots.length === 0) {
      return;
    }

    let cancelled = false;
    async function refreshStreamUrls() {
      setGridLoading(true);
      const refreshed: GridSlot[] = [];
      for (const slot of currentSlots) {
        if (slot.provider !== "howen") {
          refreshed.push(slot);
          continue;
        }
        try {
          const params = new URLSearchParams({
            deviceId: slot.deviceId,
            chs: String(slot.channel),
            stream: String(modalStream),
            wnum: "1",
            panel: "0",
            buffer: "2000",
          });
          const data = await fetchApi<{ url: string }>(
            `/api/integrations/howen/realvideo?${params.toString()}`,
          );
          refreshed.push({ ...slot, url: data.url });
        } catch {
          refreshed.push(slot);
        }
      }
      if (!cancelled) {
        const refreshedByKey = new Map(refreshed.map((slot) => [slot.key, slot]));
        setGridSlots((prev) => prev.map((slot) => refreshedByKey.get(slot.key) ?? slot));
        setGridLoading(false);
      }
    }

    void refreshStreamUrls();
    return () => {
      cancelled = true;
    };
  }, [modalStream]);

  useEffect(() => {
    setGridSlots((prev) => prev.slice(0, gridSize));
  }, [gridSize]);

  return (
    <div className="isolate flex min-h-screen flex-1 bg-[radial-gradient(circle_at_top_left,_#eff6ff,_#dbeafe_45%,_#bfdbfe)] text-slate-900">
      <aside className="w-full max-w-[430px] border-r border-slate-300 bg-white/90 p-4 backdrop-blur">
        <h1 className="text-xl font-bold">Monitor de flota en vivo</h1>
        <p className="mt-1 text-xs text-slate-600">
          Seleccionados: {Object.values(selectedIds).filter(Boolean).length} | Total: {totalDevices} |
          Refresco: {lastRefresh}
        </p>

        <div className="mt-3 space-y-2">
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2"
            placeholder="Buscar por flota, ID, patente o nombre"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} />
            Solo en linea
          </label>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

        <div className="mt-3 max-h-[calc(100vh-220px)] overflow-auto rounded-xl border border-slate-200">
          <div className="space-y-2 p-2">
            {groupedDevices.map((group) => {
              const { summary, devices, isOpen, isLoading } = group;
              return (
                <div key={summary.fleetKey} className="overflow-hidden rounded-lg border border-slate-200">
                  <button
                    className="flex w-full items-center justify-between bg-slate-100 px-3 py-2 text-left text-sm font-semibold"
                    onClick={() => toggleFleet(summary)}
                  >
                    <span>
                      {isOpen ? "v" : ">"} {summary.fleetLabel}
                    </span>
                    <span className="text-xs text-slate-500">
                      {summary.totalCount} | {summary.onlineCount} en linea
                    </span>
                  </button>

                  {isOpen && (
                    <div>
                      {isLoading && <p className="px-3 py-2 text-xs text-slate-500">Cargando vehiculos...</p>}
                      {!isLoading && devices.length === 0 && (
                        <p className="px-3 py-2 text-xs text-slate-500">
                          No hay vehiculos para los filtros actuales.
                        </p>
                      )}

                      {!isLoading && devices.length > 0 && (
                        <ul className="divide-y divide-slate-100">
                          {devices.map((device, index) => {
                            const id = extractDeviceId(device);
                            const checked = Boolean(selectedIds[id]);
                            const plate = extractPlate(device);
                            const name = String(device.devicename ?? device.deviceName ?? "-");
                            const provider = deviceProvider(device);
                            const effectiveOnline =
                              provider === "cv200"
                                ? cv200TelemetryOnline(device) || Boolean(cv200StreamActiveByDevice[id])
                                : isOnline(device.accessmode, device);
                            return (
                              <li
                                key={`${summary.fleetKey}-${id || "device"}-${index}`}
                                className={`flex items-start gap-2 px-3 py-2 text-sm ${
                                  checked ? "bg-cyan-50" : "bg-white"
                                }`}
                                onDoubleClick={() => void addDeviceToGrid(device)}
                                title="Doble clic para agregar canales con video a la grilla"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleDevice(id, e.target.checked)}
                                  disabled={!id}
                                />
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">
                                    {plate ? `${plate} - ${name}` : name}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    ID: {id || "-"} | {statusText(device, effectiveOnline)}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-300 bg-white/80 px-4 py-3">
          <div className="text-sm text-slate-700">
            Doble clic en la lista para agregar canales con video a la grilla.
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value) as 4 | 9 | 16)}
            >
              <option value={4}>4 espacios</option>
              <option value={9}>9 espacios</option>
              <option value={16}>16 espacios</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={modalStream}
              onChange={(e) => setModalStream(e.target.value === "1" ? 1 : 0)}
            >
              <option value={0}>Subflujo (0)</option>
              <option value={1}>Flujo principal (1)</option>
            </select>
            <button
              className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500"
              onClick={clearGrid}
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div
            ref={mapContainerRef}
            className="absolute inset-0 z-0"
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
            <div className="pointer-events-auto mb-2 min-h-6 rounded-md bg-white/80 px-3 py-2 text-sm text-slate-700 shadow">
              {gridLoading && <p>Cargando canales...</p>}
              {!gridLoading && gridMessage && <p>{gridMessage}</p>}
              {!gridLoading && !gridMessage && gridSlots.length === 0 && (
                <p>Mapa activo. Doble clic en un dispositivo para abrir video.</p>
              )}
            </div>

            {gridSlots.length > 0 && (
              <div
                className={`pointer-events-auto grid gap-2 ${
                  gridSize === 4 ? "grid-cols-2" : gridSize === 9 ? "grid-cols-3" : "grid-cols-4"
                }`}
              >
                {gridSlots.map((slot) => {
                  const tileHeight =
                    gridSize === 4 ? "h-[240px]" : gridSize === 9 ? "h-[180px]" : "h-[140px]";

                  return (
                    <div
                      key={slot.key}
                      className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-900"
                    >
                      <div className="absolute left-2 top-2 z-10 rounded bg-slate-950/80 px-2 py-1 text-[11px] text-slate-100">
                        {slot.label} | CH{slot.channel}
                      </div>
                      <button
                        className="absolute right-2 top-2 z-10 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold text-white"
                        onClick={() => removeGridSlot(slot.key)}
                      >
                        X
                      </button>
                      {slot.provider === "cv200" ? (
                        <Cv200HlsPlayer url={slot.url} className={tileHeight} />
                      ) : (
                        <iframe
                          src={slot.url}
                          className={`${tileHeight} w-full bg-black`}
                          allow="autoplay; fullscreen"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
