import { alarmLabelFromCode } from "@/lib/features/prevention/alarm-codes";

export type JsonValue = Record<string, unknown>;

export type DeviceSummary = {
  total: number;
  online: number;
  offline: number;
  moving: number;
  parking: number;
  idle: number;
  notLocated: number;
};

export type DeviceRankingItem = {
  deviceId: string;
  plate: string;
  name: string;
  alarmCount: number;
};

export type AttentionItem = {
  key: string;
  deviceId: string;
  plate: string;
  name: string;
  alarmCode: number | null;
  alarmType: string;
  createdAt: string;
  speed: string;
  latitude: number | null;
  longitude: number | null;
  channel: number;
  alarmGuid: string;
  evidenceUrl: string;
  evidenceStart: string;
  evidenceStop: string;
  evidencePath: string;
  evidenceFileType: string;
  raw: JsonValue;
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function extractDeviceId(item: JsonValue): string {
  const candidates = [
    item.deviceid,
    item.deviceID,
    item.deviceNo,
    item.deviceno,
    item.deviceguid,
    item.sn,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && value !== "-") return value;
  }
  return "";
}

export function extractPlate(item: JsonValue): string {
  const candidates = [item.plateNo, item.plateno, item.plateNO, item.plate];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && value !== "-") return value;
  }
  return "-";
}

export function extractName(item: JsonValue): string {
  const value = String(item.devicename ?? item.deviceName ?? item.name ?? "").trim();
  return value || "-";
}

export function extractCoords(item: JsonValue): {
  latitude: number | null;
  longitude: number | null;
} {
  return {
    latitude: toNumber(item.latitude),
    longitude: toNumber(item.longitude),
  };
}

export function isOnline(item: JsonValue): boolean {
  const mode = toNumber(item.accessmode);
  return mode !== null && mode >= 1;
}

export function buildDeviceSummary(devices: JsonValue[]): DeviceSummary {
  let online = 0;
  let moving = 0;
  let parking = 0;
  let idle = 0;
  let notLocated = 0;

  for (const device of devices) {
    if (!isOnline(device)) {
      continue;
    }
    online += 1;

    const { latitude, longitude } = extractCoords(device);
    const mode = toNumber(device.mode);
    const hasLocation = latitude !== null && longitude !== null;
    const located = hasLocation && (mode === null || mode >= 1);
    if (!located) {
      notLocated += 1;
      continue;
    }

    const speed = toNumber(device.speed) ?? 0;
    if (speed > 3) {
      moving += 1;
      continue;
    }

    const accRaw = String(device.acc ?? device.ACC ?? "").trim().toLowerCase();
    const accOff = accRaw === "0" || accRaw === "off" || accRaw === "false";
    if (accOff) {
      parking += 1;
    } else {
      idle += 1;
    }
  }

  const total = devices.length;
  return {
    total,
    online,
    offline: Math.max(total - online, 0),
    moving,
    parking,
    idle,
    notLocated,
  };
}

export function buildRanking(
  countsByDevice: Map<string, number>,
  devices: JsonValue[],
): DeviceRankingItem[] {
  const byId = new Map<string, JsonValue>();
  for (const device of devices) {
    const id = extractDeviceId(device);
    if (id) byId.set(id, device);
  }

  return Array.from(countsByDevice.entries())
    .map(([deviceId, alarmCount]) => {
      const source = byId.get(deviceId) ?? {};
      return {
        deviceId,
        alarmCount,
        plate: extractPlate(source),
        name: extractName(source),
      };
    })
    .sort((a, b) => b.alarmCount - a.alarmCount)
    .slice(0, 8);
}

function parseChannel(raw: JsonValue): number {
  const direct = Number(raw.channel ?? raw.channelNo ?? raw.channelID);
  if (Number.isFinite(direct) && direct >= 1 && direct <= 32) {
    return direct;
  }
  const text = String(raw.alarmvalue ?? "").trim();
  const match = text.match(/ch(?:annel)?\s*[:#-]?\s*(\d{1,2})/i);
  if (match?.[1]) {
    const channel = Number.parseInt(match[1], 10);
    if (Number.isFinite(channel) && channel >= 1 && channel <= 32) {
      return channel;
    }
  }
  return 1;
}

export function parseDateToMs(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const ms = Date.parse(text.replace(" ", "T"));
  return Number.isFinite(ms) ? ms : 0;
}

export function buildAttentionItems(
  events: JsonValue[],
  devices: JsonValue[],
  maxItems = 12,
): AttentionItem[] {
  const byId = new Map<string, JsonValue>();
  for (const device of devices) {
    const id = extractDeviceId(device);
    if (id) byId.set(id, device);
  }

  return events
    .map((event, index) => {
      const deviceId = String(
        event.deviceID ??
          event.deviceId ??
          event.deviceid ??
          event.deviceno ??
          event.deviceNo ??
          event.deviceguid ??
          "",
      ).trim();
      const device = byId.get(deviceId) ?? {};
      const resolvedName = String(
        event.devicename ??
          event.deviceName ??
          event.name ??
          device.devicename ??
          device.deviceName ??
          device.name ??
          "",
      ).trim();
      const latitude = toNumber(event.latitude) ?? toNumber(event.lat) ?? toNumber(device.latitude);
      const longitude = toNumber(event.longitude) ?? toNumber(event.lng) ?? toNumber(device.longitude);

      return {
        key: String(event.guid ?? `${deviceId}-${index}`),
        deviceId,
        plate: extractPlate(device),
        name: resolvedName || extractName(device) || deviceId,
        alarmCode: parseAlarmCode(event.alarmType ?? event.alarmtype),
        alarmType: String(event.alarmType ?? "-"),
        createdAt: String(
          event.createtime ??
            event.createTime ??
            event.reportTime ??
            event.alarmTime ??
            event.dtu ??
            "-",
        ),
        speed: String(event.speed ?? "-"),
        latitude,
        longitude,
        channel: parseChannel(event),
        alarmGuid: String(event.guid ?? ""),
        evidenceUrl: "",
        evidenceStart: "",
        evidenceStop: "",
        evidencePath: "",
        evidenceFileType: "",
        raw: event,
      };
    })
    .filter((item) => item.deviceId)
    .sort((a, b) => parseDateToMs(b.createdAt) - parseDateToMs(a.createdAt))
    .slice(0, maxItems);
}

function parseGpsPair(value: unknown): { longitude: number | null; latitude: number | null } {
  const text = String(value ?? "").trim();
  if (!text) {
    return { longitude: null, latitude: null };
  }
  const [lngRaw, latRaw] = text.split(",").map((part) => part.trim());
  const longitude = toNumber(lngRaw);
  const latitude = toNumber(latRaw);
  return { longitude, latitude };
}

function normalizeAlarmType(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || "-";
}

function parseAlarmCode(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function alarmLabelFromEc(ecValue: unknown, det: JsonValue): string {
  const ec = Number(ecValue);
  if (Number.isFinite(ec)) {
    const byTable = alarmLabelFromCode(ec);
    if (byTable) {
      return byTable;
    }
  }
  const detTypeText = String(det.tp ?? det.type ?? det.name ?? "").trim().toLowerCase();

  const dmsTypeMap: Record<string, string> = {
    "1": "Distracted Driving",
    "2": "Yawning",
    "3": "Eyes Closed",
    "4": "Fatigue Driving",
    distracted: "Distracted Driving",
    yawning: "Yawning",
    eyesclosed: "Eyes Closed",
    fatigue: "Fatigue Driving",
  };
  if (detTypeText && dmsTypeMap[detTypeText]) {
    return dmsTypeMap[detTypeText];
  }

  const maybeText = String(ecValue ?? "").trim();
  return maybeText || "-";
}

function normalizeChannel(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  const maybeZeroBased = n <= 0 ? 1 : n;
  return Math.max(1, Math.min(32, maybeZeroBased));
}

export function buildAttentionItemsFromEvidence(
  evidenceRows: JsonValue[],
  devices: JsonValue[],
  maxItems = 12,
): AttentionItem[] {
  const byId = new Map<string, JsonValue>();
  for (const device of devices) {
    const id = extractDeviceId(device);
    if (id) byId.set(id, device);
  }

  const items: AttentionItem[] = [];

  for (const row of evidenceRows) {
    const deviceId = String(
      row.deviceID ?? row.deviceId ?? row.deviceid ?? row.deviceno ?? row.deviceguid ?? "",
    ).trim();
    if (!deviceId) continue;

    const device = byId.get(deviceId) ?? {};
    const alarmFiles = Array.isArray(row.alarmFile) ? (row.alarmFile as JsonValue[]) : [];
    const preferred =
      alarmFiles.find((file) => String(file.fileType ?? "").trim() === "2") ??
      alarmFiles.find((file) => String(file.fileType ?? "").trim() === "4") ??
      alarmFiles[0] ??
      null;

    const gps = parseGpsPair(row.alarmGps);
    const name = String(
      row.devicename ??
        row.deviceName ??
        device.devicename ??
        device.deviceName ??
        device.name ??
        "",
    ).trim();

    items.push({
      key: String(row.alarmGuid ?? row.guid ?? `${deviceId}-${items.length}`),
      alarmGuid: String(row.alarmGuid ?? row.guid ?? "").trim(),
      deviceId,
      plate: extractPlate(device),
      name: name || extractName(device) || deviceId,
      alarmCode: parseAlarmCode(row.alarmType ?? row.alarmtype),
      alarmType: normalizeAlarmType(row.alarmType ?? row.alarmtype),
      createdAt: String(row.alarmTime ?? row.createtime ?? row.reportTime ?? "-"),
      speed: String(row.speed ?? "-"),
      latitude: gps.latitude ?? toNumber(device.latitude),
      longitude: gps.longitude ?? toNumber(device.longitude),
      channel: normalizeChannel(preferred?.channel),
      evidenceUrl: String(preferred?.downUrl ?? preferred?.downurl ?? "").trim(),
      evidenceStart: String(preferred?.fileStartTime ?? preferred?.start ?? "").trim(),
      evidenceStop: String(preferred?.fileStopTime ?? preferred?.stop ?? "").trim(),
      evidencePath: String(preferred?.filePath ?? preferred?.path ?? "").trim(),
      evidenceFileType: String(preferred?.fileType ?? ""),
      raw: row,
    });
  }

  return items
    .sort((a, b) => parseDateToMs(b.createdAt) - parseDateToMs(a.createdAt))
    .slice(0, maxItems);
}

export function buildAttentionItemFromWsAlarm(
  wsMessage: JsonValue,
  devices: JsonValue[],
): AttentionItem | null {
  const payload = (wsMessage.payload ?? {}) as JsonValue;
  const detailPayload = (payload.payload ?? {}) as JsonValue;
  const location = (payload.location ?? {}) as JsonValue;
  const det = (detailPayload.det ?? {}) as JsonValue;

  const deviceId = String(payload.deviceID ?? payload.deviceId ?? "").trim();
  if (!deviceId) {
    return null;
  }

  const byId = new Map<string, JsonValue>();
  for (const device of devices) {
    const id = extractDeviceId(device);
    if (id) byId.set(id, device);
  }
  const device = byId.get(deviceId) ?? {};

  const gpsLongitude = toNumber(location.longitude);
  const gpsLatitude = toNumber(location.latitude);
  const alarmCode = parseAlarmCode(detailPayload.ec ?? payload.alarmType);
  const alarmType = alarmLabelFromEc(alarmCode, det);
  const createdAt = String(
    detailPayload.dtu ?? detailPayload.st ?? payload.alarmTime ?? payload.reportTime ?? "",
  ).trim();

  const channel = normalizeChannel(det.ch ?? det.channel ?? det.chn);
  const name = String(
    device.devicename ?? device.deviceName ?? device.name ?? deviceId,
  ).trim();

  return {
    key: String(payload.alarmID ?? `${deviceId}-${createdAt}`),
    alarmGuid: String(payload.alarmID ?? "").trim(),
    deviceId,
    plate: extractPlate(device),
    name: name || deviceId,
    alarmCode,
    alarmType,
    createdAt: createdAt || "-",
    speed: String(location.speed ?? "-"),
    latitude: gpsLatitude ?? toNumber(device.latitude),
    longitude: gpsLongitude ?? toNumber(device.longitude),
    channel,
    evidenceUrl: "",
    evidenceStart: "",
    evidenceStop: "",
    evidencePath: "",
    evidenceFileType: "",
    raw: wsMessage,
  };
}
