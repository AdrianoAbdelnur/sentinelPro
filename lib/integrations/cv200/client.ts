type Cv200Envelope<T> = {
  success: boolean;
  data?: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
  error?: {
    code?: string;
    message?: string;
    providerCode?: number;
  };
};

export type Cv200Device = {
  id: string;
  source: "cv200";
  isOnline: boolean;
  imei?: string;
  name?: string;
  fleetId?: string;
  lastSeenAt?: string;
  lastHeartbeatAt?: string;
  lastIp?: string;
};

export type Cv200DevicesPage = {
  data: Cv200Device[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
};

const DEFAULT_BASE_URL = "http://127.0.0.1:3100";

const getBaseUrl = (): string =>
  (process.env.CV200_INGEST_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

const toSearch = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) {
      search.set(key, value);
    }
  }
  return search.toString();
};

const fetchPage = async (params: Record<string, string | undefined>): Promise<Cv200DevicesPage> => {
  const url = `${getBaseUrl()}/devices?${toSearch(params)}`;
  const response = await fetch(url, { cache: "no-store" });

  let payload: Cv200Envelope<Cv200Device[]>;
  try {
    payload = (await response.json()) as Cv200Envelope<Cv200Device[]>;
  } catch {
    throw new Error(`CV200 upstream returned invalid JSON (${response.status})`);
  }

  if (!response.ok || !payload.success || !payload.data) {
    const message = payload.error?.message || `CV200 upstream HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    data: payload.data,
    meta: {
      page: payload.meta?.page ?? 1,
      pageSize: payload.meta?.pageSize ?? payload.data.length,
      total: payload.meta?.total ?? payload.data.length,
    },
  };
};

export const fetchCv200DevicesPage = async (params: {
  page?: number;
  pageSize?: number;
  isOnline?: "0" | "1";
  keyword?: string;
  fleetId?: string;
}): Promise<Cv200DevicesPage> =>
  fetchPage({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 50),
    ...(params.isOnline ? { isOnline: params.isOnline === "1" ? "true" : "false" } : {}),
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.fleetId ? { fleetId: params.fleetId } : {}),
  });

export const fetchAllCv200Devices = async (params: {
  isOnline?: "0" | "1";
  keyword?: string;
  fleetId?: string;
}): Promise<Cv200Device[]> => {
  const pageSize = 200;
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  const all: Cv200Device[] = [];

  while (all.length < total) {
    const current = await fetchCv200DevicesPage({
      page,
      pageSize,
      isOnline: params.isOnline,
      keyword: params.keyword,
      fleetId: params.fleetId,
    });
    all.push(...current.data);
    total = current.meta.total;
    if (current.data.length === 0) {
      break;
    }
    page += 1;
  }

  return all;
};

export const mapCv200ToHowenDeviceShape = (device: Cv200Device): Record<string, unknown> => {
  const fleetId = (device.fleetId ?? "").trim();
  const fleetLabel = fleetId ? `CV200 ${fleetId}` : "CV200";
  const deviceName = device.name?.trim() || `CV200 ${device.id}`;

  return {
    source: "cv200",
    provider: "cv200",
    deviceid: device.id,
    deviceID: device.id,
    deviceno: device.id,
    deviceNo: device.id,
    deviceguid: device.id,
    devicename: deviceName,
    deviceName,
    fleetid: fleetId,
    fleetId,
    fleetname: fleetLabel,
    fleetName: fleetLabel,
    accessmode: device.isOnline ? 5 : -1,
    channelname: "CH1",
    videoencodernumber: 1,
    imei: device.imei,
    isOnline: device.isOnline,
    lastSeenAt: device.lastSeenAt,
    lastHeartbeatAt: device.lastHeartbeatAt,
    lastIp: device.lastIp,
  };
};
