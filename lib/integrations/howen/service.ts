import { HowenClient } from "@/lib/integrations/howen/client";
import { getHowenConfig } from "@/lib/integrations/howen/config";
import type {
  HowenAlarmsParams,
  HowenDevicesParams,
  HowenEvidenceSearchParams,
  HowenVideoSearchParams,
} from "@/lib/integrations/howen/types";

const SOURCE = "howen";

export class HowenService {
  private getClient(): HowenClient {
    return new HowenClient();
  }

  async connectionStatus() {
    const session = await this.getClient().connect();
    return {
      source: SOURCE,
      connected: true,
      tokenPreview: `${session.token.slice(0, 6)}...${session.token.slice(-4)}`,
      pidPreview: `${session.pid.slice(0, 6)}...${session.pid.slice(-4)}`,
      checkedAt: new Date().toISOString(),
    };
  }

  async devices(params: HowenDevicesParams) {
    const data = await this.getClient().fetchDevices(params);
    return { source: SOURCE, ...data };
  }

  async events(params: HowenAlarmsParams) {
    const data = await this.getClient().fetchAlarms(params);
    return { source: SOURCE, ...data };
  }

  async recordings(params: HowenVideoSearchParams) {
    const data = await this.getClient().fetchRecordings(params);
    return { source: SOURCE, ...data };
  }

  async evidence(params: HowenEvidenceSearchParams) {
    const data = await this.getClient().fetchEvidence(params);
    return { source: SOURCE, data };
  }

  async deviceStatus(params: { deviceID: string }) {
    const data = await this.getClient().fetchDeviceStatus(params);
    return { source: SOURCE, data };
  }

  async overview(params: {
    deviceID: string;
    beginTime: string;
    endTime: string;
    channelList?: string;
    alarmType?: string;
    fileType?: "1" | "2" | "3" | "4";
    location?: "1" | "2" | "4" | "5";
  }) {
    const [devices, events, recordings] = await Promise.all([
      this.devices({ pageNum: 1, pageCount: 50, keyword: params.deviceID }),
      this.events({
        pageNum: 1,
        pageCount: 50,
        deviceID: params.deviceID,
        beginTime: params.beginTime,
        endTime: params.endTime,
        alarmType: params.alarmType,
      }),
      this.recordings({
        deviceID: params.deviceID,
        startTime: params.beginTime,
        endTime: params.endTime,
        channelList: params.channelList,
        fileType: params.fileType ?? "1",
        location: params.location ?? "1",
      }),
    ]);

    return {
      source: SOURCE,
      overviewAt: new Date().toISOString(),
      devices,
      events,
      recordings,
    };
  }

  async liveStreamUrl(params: { deviceId: string; channel: number; stream: 0 | 1 }) {
    const url = await this.getClient().buildLiveStreamUrl(params);
    return { source: SOURCE, url };
  }

  async realVideoPageUrl(params: {
    deviceId: string;
    chs: string;
    stream: 0 | 1;
    wnum?: 1 | 4 | 6 | 9 | 16;
    panel?: 0 | 1;
    buffer?: number;
  }) {
    const session = await this.getClient().connect();
    const config = getHowenConfig();
    const search = new URLSearchParams({
      token: session.token,
      deviceId: params.deviceId,
      chs: params.chs,
      stream: String(params.stream),
    });

    if (typeof params.wnum === "number") {
      search.set("wnum", String(params.wnum));
    }
    if (typeof params.panel === "number") {
      search.set("panel", String(params.panel));
    }
    if (typeof params.buffer === "number") {
      search.set("buffer", String(params.buffer));
    }

    return {
      source: SOURCE,
      url: `${config.webBaseUrl}/vss/apiPage/RealVideo.html?${search.toString()}`,
    };
  }
}
