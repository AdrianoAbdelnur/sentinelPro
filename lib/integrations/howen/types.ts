export type HowenStatusCode = number;

export interface HowenApiResponse<TData> {
  status: HowenStatusCode;
  msg: string;
  data: TData;
}

export interface HowenSessionData {
  token: string;
  pid: string;
  [key: string]: unknown;
}

export interface HowenPagedResult<TItem> {
  totalCount: number;
  pageCount: number;
  fromCount: number;
  toCount: number;
  totalNum: number;
  pageNum: number;
  dataList: TItem[];
}

export interface HowenDeviceRecord {
  guid?: string;
  deviceid?: string;
  devicename?: string;
  devicetype?: string;
  fleetid?: string;
  accessmode?: number;
  longitude?: number | string;
  latitude?: number | string;
  lastonlinetime?: string;
  lastofflinetime?: string;
  [key: string]: unknown;
}

export interface HowenAlarmRecord {
  guid?: string;
  deviceID?: string;
  alarmType?: number | string;
  alarmvalue?: string;
  createtime?: string;
  alarmState?: number | string;
  alarmGps?: string;
  speed?: number | string;
  reportTime?: string;
  [key: string]: unknown;
}

export interface HowenVideoFileRecord {
  deviceID?: string;
  channel?: number | string;
  duration?: number | string;
  size?: number | string;
  type?: number | string;
  start?: string;
  stop?: string;
  path?: string;
  alarmType?: number | string;
  downUrl?: string;
  [key: string]: unknown;
}

export interface HowenVideoSearchResult {
  files: HowenVideoFileRecord[];
  [key: string]: unknown;
}

export interface HowenDevicesParams {
  pageNum: number;
  pageCount: number;
  isOnline?: "0" | "1";
  keyword?: string;
  fleetid?: string;
}

export interface HowenAlarmsParams {
  pageNum: number;
  pageCount: number;
  deviceID: string;
  beginTime: string;
  endTime: string;
  alarmType?: string;
}

export interface HowenVideoSearchParams {
  deviceID: string;
  startTime: string;
  endTime: string;
  channelList?: string;
  fileType: "1" | "2" | "3" | "4";
  location: "1" | "2" | "4" | "5";
  scheme?: "http" | "https";
}

export interface HowenEvidenceSearchParams {
  conditionName: string;
  startTime: string;
  endTime: string;
  alarmType?: string;
  scheme?: "http" | "https";
}

export interface HowenEvidenceFile {
  fileGuid?: string;
  fileType?: number | string;
  filePath?: string;
  channel?: number | string;
  fileThumbnail?: string;
  fileStartTime?: string;
  fileStopTime?: string;
  downUrl?: string;
  alarmType?: number | string;
  [key: string]: unknown;
}

export interface HowenEvidenceRecord {
  deviceID?: string;
  alarmType?: number | string;
  alarmGuid?: string;
  alarmGps?: string;
  alarmTime?: string;
  alarmFile?: HowenEvidenceFile[];
  [key: string]: unknown;
}

export interface HowenDeviceStatusRecord {
  deviceguid?: string;
  deviceName?: string;
  recordState?: number | string;
  videoMaskState?: number | string;
  videoLostState?: number | string;
  [key: string]: unknown;
}
