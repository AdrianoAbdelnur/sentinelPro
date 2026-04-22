"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; providerCode?: number };
};

type PagedData<T> = {
  totalCount?: number;
  pageCount?: number;
  fromCount?: number;
  toCount?: number;
  totalNum?: number;
  pageNum?: number;
  dataList?: T[];
};

type JsonValue = Record<string, unknown>;

function extractDeviceId(item: JsonValue): string {
  const directCandidates = [
    item.deviceid,
    item.deviceID,
    item.deviceNo,
    item.deviceno,
    item.sn,
    item.deviceSn,
  ];

  for (const candidate of directCandidates) {
    const value = String(candidate ?? "").trim();
    if (value && value !== "-") {
      return value;
    }
  }

  const nameCandidates = [item.devicename, item.deviceName, item.name];
  for (const candidate of nameCandidates) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    const match = value.match(/^([A-Za-z0-9_-]{3,})\s*-/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
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

function isOnlineAccessMode(value: unknown): boolean {
  const mode = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(mode) && mode >= 1;
}

function accessModeLabel(value: unknown): string {
  const raw = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(raw)) {
    return "Desconocido";
  }

  const mode = raw as number;
  if (mode === -1) return "Desconectado";
  if (mode === 0) return "En linea - Desconocido";
  if (mode === 1) return "En linea - Ethernet";
  if (mode === 2) return "En linea - WiFi";
  if (mode === 3) return "En linea - 2G";
  if (mode === 4) return "En linea - 3G";
  if (mode === 5) return "En linea - 4G";
  if (mode === 6) return "En linea - 5G";
  if (mode === 7) return "En linea - WiFi + 3/4/5G";
  if (mode === 8) return "En linea - Cable + 3/4/5G";

  return `En linea - Modo ${mode}`;
}

function toHowenDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  const ss = `${date.getSeconds()}`.padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
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

export default function Home() {
  const initialRange = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { begin: toHowenDate(start), end: toHowenDate(end) };
  }, []);

  const [deviceId, setDeviceId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [beginTime, setBeginTime] = useState(initialRange.begin);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [channelList, setChannelList] = useState("1");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [connection, setConnection] = useState<JsonValue | null>(null);
  const [devices, setDevices] = useState<PagedData<JsonValue> | null>(null);
  const [events, setEvents] = useState<PagedData<JsonValue> | null>(null);
  const [recordings, setRecordings] = useState<{ files?: JsonValue[] } | null>(null);
  const [overview, setOverview] = useState<JsonValue | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<JsonValue | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<JsonValue | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<JsonValue | null>(null);
  const [collapsedFleets, setCollapsedFleets] = useState<Record<string, boolean>>({});
  const [deviceFilter, setDeviceFilter] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [liveChannel, setLiveChannel] = useState(1);
  const [liveStream, setLiveStream] = useState<0 | 1>(0);
  const [livePath, setLivePath] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("Sin iniciar");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const flvPlayerRef = useRef<{
    destroy: () => void;
    attachMediaElement: (el: HTMLVideoElement) => void;
    load: () => void;
    play: () => Promise<void> | void;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
  } | null>(null);

  async function execute<T>(fn: () => Promise<T>, onSuccess: (data: T) => void) {
    setLoading(true);
    setError(null);
    try {
      const data = await fn();
      onSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function loadConnection() {
    await execute(
      () => fetchApi<JsonValue>("/api/integrations/howen/connection"),
      setConnection,
    );
  }

  async function loadDevices() {
    const params = new URLSearchParams({
      all: "1",
    });
    if (deviceId.trim()) {
      params.set("keyword", deviceId.trim());
    }

    await execute(
      () =>
        fetchApi<PagedData<JsonValue>>(
          `/api/integrations/howen/devices?${params.toString()}`,
        ),
      (data) => {
        setDevices(data);
        const first = data.dataList?.[0] ?? null;
        if (!selectedDevice && first) {
          setSelectedDevice(first);
          setDeviceId(String(first.deviceid ?? ""));
        }
      },
    );
  }

  async function loadEvents() {
    if (!deviceId.trim()) {
      setError("Para eventos, completa el ID de dispositivo.");
      return;
    }

    const params = new URLSearchParams({
      deviceId: deviceId.trim(),
      beginTime,
      endTime,
      page: `${page}`,
      pageSize: `${pageSize}`,
    });

    await execute(
      () => fetchApi<PagedData<JsonValue>>(`/api/integrations/howen/events?${params}`),
      (data) => {
        setEvents(data);
        const first = data.dataList?.[0] ?? null;
        if (first) {
          setSelectedEvent(first);
        }
      },
    );
  }

  async function loadRecordings() {
    if (!deviceId.trim()) {
      setError("Para grabaciones, completa el ID de dispositivo.");
      return;
    }

    const params = new URLSearchParams({
      deviceId: deviceId.trim(),
      startTime: beginTime,
      endTime,
      fileType: "1",
      location: "1",
      channelList,
    });

    await execute(
      () =>
        fetchApi<{ files?: JsonValue[] }>(
          `/api/integrations/howen/recordings?${params.toString()}`,
        ),
      (data) => {
        setRecordings(data);
        const first = data.files?.[0] ?? null;
        if (first) {
          setSelectedRecording(first);
        }
      },
    );
  }

  async function loadOverview() {
    if (!deviceId.trim()) {
      setError("Para resumen, completa el ID de dispositivo.");
      return;
    }

    const params = new URLSearchParams({
      deviceId: deviceId.trim(),
      beginTime,
      endTime,
      channelList,
      fileType: "1",
      location: "1",
    });

    await execute(
      () => fetchApi<JsonValue>(`/api/integrations/howen/overview?${params.toString()}`),
      setOverview,
    );
  }

  function selectDevice(item: JsonValue) {
    setSelectedDevice(item);
    const id = extractDeviceId(item);
    if (id) {
      setDeviceId(id);
    }
  }

  function toggleFleet(fleetKey: string) {
    setCollapsedFleets((prev) => ({ ...prev, [fleetKey]: !prev[fleetKey] }));
  }

  function selectEvent(item: JsonValue) {
    setSelectedEvent(item);
  }

  function selectRecording(item: JsonValue) {
    setSelectedRecording(item);
  }

  function stopLive() {
    flvPlayerRef.current?.destroy();
    flvPlayerRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    setLivePath(null);
    setLiveStatus("Detenido");
  }

  function startLive() {
    const selectedId = String(selectedDevice?.deviceid ?? "");
    const targetDeviceId = deviceId.trim() || selectedId;
    if (!targetDeviceId) {
      setError("Para en vivo, selecciona un dispositivo o completa el ID de dispositivo.");
      return;
    }

    setError(null);
    setLiveStatus("Conectando...");
    const params = new URLSearchParams({
      deviceId: targetDeviceId,
      channel: `${liveChannel}`,
      stream: `${liveStream}`,
    });
    setLivePath(`/api/integrations/howen/live?${params.toString()}`);
  }

  useEffect(() => {
    void loadConnection();
    void loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function mountPlayer() {
      if (!livePath || !videoRef.current) {
        return;
      }

      try {
        flvPlayerRef.current?.destroy();
        flvPlayerRef.current = null;

        const flvModule = await import("flv.js");
        const flvjs = flvModule.default ?? flvModule;
        if (!flvjs.isSupported()) {
          setLiveStatus("FLV no soportado por este navegador");
          return;
        }

        if (cancelled || !videoRef.current) {
          return;
        }

        const player = flvjs.createPlayer(
          { type: "flv", isLive: true, url: livePath },
          { enableStashBuffer: false, stashInitialSize: 128 },
        );
        if (typeof player.on === "function") {
          player.on("error", () => {
            setLiveStatus("Transmision con error");
          });
        }
        player.attachMediaElement(videoRef.current);
        player.load();
        try {
          await player.play();
        } catch {
          setLiveStatus("No se pudo iniciar la reproduccion");
        }

        flvPlayerRef.current = player;
        if (videoRef.current.readyState >= 2) {
          setLiveStatus("Reproduciendo");
        } else {
          setLiveStatus("Conectado, esperando datos...");
        }
      } catch (err) {
        setLiveStatus("Error de reproduccion");
        setError(err instanceof Error ? err.message : "No se pudo iniciar la vista en vivo");
      }
    }

    void mountPlayer();

    return () => {
      cancelled = true;
      flvPlayerRef.current?.destroy();
      flvPlayerRef.current = null;
    };
  }, [livePath]);

  const devicesList = useMemo(() => devices?.dataList ?? [], [devices]);
  const eventsList = useMemo(() => events?.dataList ?? [], [events]);
  const recordingsList = useMemo(() => recordings?.files ?? [], [recordings]);
  const selectedDeviceId = extractDeviceId(selectedDevice ?? {});
  const selectedEventId = String(selectedEvent?.guid ?? "");
  const selectedRecordingId = String(selectedRecording?.path ?? "");
  const groupedDevices = useMemo(() => {
    const filter = deviceFilter.trim().toLowerCase();
    const filteredDevices = devicesList.filter((device) => {
      if (onlyOnline && !isOnlineAccessMode(device.accessmode)) {
        return false;
      }

      if (!filter) {
        return true;
      }

      const id = extractDeviceId(device).toLowerCase();
      const plate = extractPlate(device).toLowerCase();
      return id.includes(filter) || plate.includes(filter);
    });

    const groups = new Map<
      string,
      {
        fleetLabel: string;
        devices: JsonValue[];
        onlineCount: number;
        offlineCount: number;
      }
    >();

    for (const device of filteredDevices) {
      const fleetRaw =
        String(device.fleetname ?? device.fleetName ?? device.fleetid ?? device.fleetId ?? "")
          .trim() || "Sin flota";
      const fleetKey = fleetRaw.toLowerCase();
      const mode = Number.parseInt(String(device.accessmode ?? ""), 10);
      const isOffline = Number.isFinite(mode) && mode === -1;

      if (!groups.has(fleetKey)) {
        groups.set(fleetKey, {
          fleetLabel: fleetRaw,
          devices: [],
          onlineCount: 0,
          offlineCount: 0,
        });
      }

      const group = groups.get(fleetKey)!;
      group.devices.push(device);
      if (isOffline) {
        group.offlineCount += 1;
      } else {
        group.onlineCount += 1;
      }
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.fleetLabel.localeCompare(b.fleetLabel),
    );
  }, [deviceFilter, devicesList, onlyOnline]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f8fafc,_#e2e8f0_45%,_#cbd5e1)] text-slate-900">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <header className="rounded-3xl border border-slate-200 bg-white/75 p-6 shadow-xl backdrop-blur">
          <p className="text-xs font-semibold tracking-[0.24em] text-slate-500">
            SENTINEL PRO / HOWEN
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">
            Panel de Integracion Operativa
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-700 md:text-base">
            Consulta conexion, dispositivos, eventos y grabaciones en una sola vista.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-lg backdrop-blur md:p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
              placeholder="ID de dispositivo (ej. 99990001)"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
              placeholder="inicio YYYY-MM-DD HH:mm:ss"
              value={beginTime}
              onChange={(e) => setBeginTime(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
              placeholder="fin YYYY-MM-DD HH:mm:ss"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
              placeholder="channelList (ej. 1;2)"
              value={channelList}
              onChange={(e) => setChannelList(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
              type="number"
              min={1}
              max={5000}
              value={page}
              onChange={(e) => setPage(Number(e.target.value) || 1)}
              placeholder="pagina"
            />
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
              type="number"
              min={1}
              max={1000}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) || 20)}
              placeholder="tamano de pagina"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              onClick={() => void loadConnection()}
            >
              Conexion
            </button>
            <button
              className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
              onClick={() => void loadDevices()}
            >
              Dispositivos
            </button>
            <button
              className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
              onClick={() => void loadEvents()}
            >
              Eventos
            </button>
            <button
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
              onClick={() => void loadRecordings()}
            >
              Grabaciones
            </button>
            <button
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
              onClick={() => void loadOverview()}
            >
              Resumen
            </button>
          </div>

          <div className="mt-3 min-h-6 text-sm">
            {loading && <p className="text-slate-700">Consultando datos...</p>}
            {!loading && error && <p className="font-medium text-red-600">{error}</p>}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow">
            <p className="text-xs uppercase tracking-widest text-slate-500">Conexion</p>
            <p className="mt-2 text-2xl font-bold">{connection ? "OK" : "-"}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow">
            <p className="text-xs uppercase tracking-widest text-slate-500">Dispositivos</p>
            <p className="mt-2 text-2xl font-bold">{devices?.totalCount ?? "-"}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow">
            <p className="text-xs uppercase tracking-widest text-slate-500">Eventos</p>
            <p className="mt-2 text-2xl font-bold">{events?.totalCount ?? "-"}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow">
            <p className="text-xs uppercase tracking-widest text-slate-500">Grabaciones</p>
            <p className="mt-2 text-2xl font-bold">{recordingsList.length || "-"}</p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow">
            <h2 className="text-lg font-semibold">
              Dispositivos (clic para detalle) - Cargados {devicesList.length}/
              {devices?.totalCount ?? 0}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                className="min-w-72 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
                placeholder="Filtrar dispositivos por ID o patente"
                value={deviceFilter}
                onChange={(e) => setDeviceFilter(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyOnline}
                  onChange={(e) => setOnlyOnline(e.target.checked)}
                />
                Solo en linea
              </label>
            </div>
            <div className="mt-3 max-h-[460px] overflow-auto rounded-lg border border-slate-200">
              <div className="space-y-2 p-2">
                {groupedDevices.map((group) => {
                  const fleetKey = group.fleetLabel.toLowerCase();
                  const isCollapsed = collapsedFleets[fleetKey] ?? false;

                  return (
                    <div key={fleetKey} className="overflow-hidden rounded-lg border border-slate-200">
                      <button
                        className="flex w-full items-center justify-between bg-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-700"
                        onClick={() => toggleFleet(fleetKey)}
                      >
                        <span>
                          {isCollapsed ? ">" : "v"} {group.fleetLabel}
                        </span>
                        <span className="text-xs text-slate-500">
                          Total: {group.devices.length} | En linea: {group.onlineCount} | Desconectados:{" "}
                          {group.offlineCount}
                        </span>
                      </button>

                      {!isCollapsed && (
                        <table className="w-full text-left text-sm">
                          <thead className="bg-white">
                            <tr className="border-b border-slate-200 text-slate-600">
                              <th className="py-2 pl-3">ID de dispositivo</th>
                              <th className="py-2">Patente</th>
                              <th className="py-2">Nombre</th>
                              <th className="py-2 pr-3">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.devices.map((item, index) => {
                              const rowDeviceId = extractDeviceId(item);
                              const active = rowDeviceId !== "" && rowDeviceId === selectedDeviceId;
                              return (
                                <tr
                                  key={`${group.fleetLabel}-${rowDeviceId || "dev"}-${index}`}
                                  className={`cursor-pointer border-b border-slate-100 transition ${
                                    active ? "bg-sky-100" : "hover:bg-slate-100"
                                  }`}
                                  onClick={() => selectDevice(item)}
                                >
                                  <td className="py-2 pl-3">{rowDeviceId || "-"}</td>
                                  <td className="py-2">{extractPlate(item) || "-"}</td>
                                  <td className="py-2">{String(item.devicename ?? item.deviceName ?? "-")}</td>
                                  <td className="py-2 pr-3">{accessModeLabel(item.accessmode)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow">
            <h2 className="text-lg font-semibold">Detalle del dispositivo seleccionado</h2>
            <pre className="mt-3 max-h-[460px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(
                selectedDevice ?? { info: "Haz clic en un dispositivo para ver su detalle." },
                null,
                2,
              )}
            </pre>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow">
            <h2 className="text-lg font-semibold">Eventos (clic para detalle)</h2>
            <div className="mt-3 max-h-[460px] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2 pl-3">GUID</th>
                    <th className="py-2">Tipo</th>
                    <th className="py-2 pr-3">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsList.map((item, index) => {
                    const eventId = String(item.guid ?? "");
                    const active = eventId !== "" && eventId === selectedEventId;
                    return (
                      <tr
                        key={`${eventId || "evt"}-${index}`}
                        className={`cursor-pointer border-b border-slate-100 transition ${
                          active ? "bg-cyan-100" : "hover:bg-slate-100"
                        }`}
                        onClick={() => selectEvent(item)}
                      >
                        <td className="py-2 pl-3">{String(item.guid ?? "-")}</td>
                        <td className="py-2">{String(item.alarmType ?? "-")}</td>
                        <td className="py-2 pr-3">{String(item.createtime ?? "-")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow">
            <h2 className="text-lg font-semibold">Detalle del evento seleccionado</h2>
            <pre className="mt-3 max-h-[460px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(
                selectedEvent ?? { info: "Haz clic en un evento para ver su detalle." },
                null,
                2,
              )}
            </pre>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow">
            <h2 className="text-lg font-semibold">Grabaciones (clic para detalle)</h2>
            <div className="mt-3 max-h-[460px] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2 pl-3">Dispositivo</th>
                    <th className="py-2">Canal</th>
                    <th className="py-2">Inicio</th>
                    <th className="py-2 pr-3">Fin</th>
                  </tr>
                </thead>
                <tbody>
                  {recordingsList.map((item, index) => {
                    const recordingId = String(item.path ?? "");
                    const active = recordingId !== "" && recordingId === selectedRecordingId;
                    return (
                      <tr
                        key={`${recordingId || "rec"}-${index}`}
                        className={`cursor-pointer border-b border-slate-100 transition ${
                          active ? "bg-teal-100" : "hover:bg-slate-100"
                        }`}
                        onClick={() => selectRecording(item)}
                      >
                        <td className="py-2 pl-3">{String(item.deviceID ?? "-")}</td>
                        <td className="py-2">{String(item.channel ?? "-")}</td>
                        <td className="py-2">{String(item.start ?? "-")}</td>
                        <td className="py-2 pr-3">{String(item.stop ?? "-")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow">
            <h2 className="text-lg font-semibold">Detalle de la grabacion seleccionada</h2>
            <pre className="mt-3 max-h-[460px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(
                selectedRecording ?? { info: "Haz clic en una grabacion para ver su detalle." },
                null,
                2,
              )}
            </pre>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow">
          <h2 className="text-lg font-semibold">Transmision en vivo (via proxy backend)</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
              type="number"
              min={1}
              max={32}
              value={liveChannel}
              onChange={(e) => setLiveChannel(Math.max(1, Number(e.target.value) || 1))}
              placeholder="Canal"
            />
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-300 transition focus:ring-2"
              value={liveStream}
              onChange={(e) => setLiveStream(e.target.value === "1" ? 1 : 0)}
            >
              <option value={0}>Subflujo (0)</option>
              <option value={1}>Flujo principal (1)</option>
            </select>
            <button
              className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              onClick={startLive}
            >
              Iniciar en vivo
            </button>
            <button
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              onClick={stopLive}
            >
              Detener
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-700">Estado en vivo: {liveStatus}</p>
          <video
            ref={videoRef}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-black"
            controls
            muted
            autoPlay
          />
          <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {livePath ?? "Sin URL activa de en vivo."}
          </pre>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow">
          <h2 className="text-lg font-semibold">JSON de resumen</h2>
          <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
            {JSON.stringify(
              overview ?? { info: "Ejecuta el boton Resumen para ver datos agregados." },
              null,
              2,
            )}
          </pre>
        </section>
      </main>
    </div>
  );
}
