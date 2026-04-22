import { fromError, ok } from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";

export const runtime = "nodejs";

const howenService = new HowenService();

type JsonValue = Record<string, unknown>;

type FleetBucket = {
  fleetKey: string;
  fleetId: string | null;
  fleetLabel: string;
  totalCount: number;
  onlineCount: number;
  offlineCount: number;
};

function extractFleetId(item: JsonValue): string | null {
  const raw = String(item.fleetid ?? item.fleetId ?? "").trim();
  return raw ? raw : null;
}

function extractFleetLabel(item: JsonValue): string {
  return (
    String(item.fleetname ?? item.fleetName ?? item.fleetid ?? item.fleetId ?? "").trim() ||
    "Sin Fleet"
  );
}

function isOnline(item: JsonValue): boolean {
  const mode = Number(item.accessmode);
  return Number.isFinite(mode) && mode >= 1;
}

export async function GET(): Promise<Response> {
  try {
    const data = await howenService.devices({
      pageNum: -1,
      pageCount: -1,
    });

    const devices = (data.dataList ?? []) as JsonValue[];
    const groups = new Map<string, FleetBucket>();

    for (const device of devices) {
      const fleetId = extractFleetId(device);
      const fleetLabel = extractFleetLabel(device);
      const fleetKey = `${fleetId ?? "__no_fleet__"}::${fleetLabel.toLowerCase()}`;

      if (!groups.has(fleetKey)) {
        groups.set(fleetKey, {
          fleetKey,
          fleetId,
          fleetLabel,
          totalCount: 0,
          onlineCount: 0,
          offlineCount: 0,
        });
      }

      const bucket = groups.get(fleetKey)!;
      bucket.totalCount += 1;
      if (isOnline(device)) {
        bucket.onlineCount += 1;
      } else {
        bucket.offlineCount += 1;
      }
    }

    const dataList = Array.from(groups.values()).sort((a, b) =>
      a.fleetLabel.localeCompare(b.fleetLabel),
    );

    return ok({
      source: "howen",
      totalCount: dataList.length,
      totalDevices: devices.length,
      dataList,
    });
  } catch (error) {
    return fromError(error);
  }
}
