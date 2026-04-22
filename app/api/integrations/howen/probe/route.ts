import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import { fail, ok, requiredQuery } from "@/lib/http/api";
import { howenLogger } from "@/lib/integrations/howen/logger";
import { HowenService } from "@/lib/integrations/howen/service";

export const runtime = "nodejs";

const howenService = new HowenService();

type FfprobeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  level?: number;
  codec_tag_string?: string;
  codec_tag?: string;
  sample_fmt?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  time_base?: string;
  start_pts?: number;
  start_time?: string;
  duration_ts?: number;
  duration?: string;
  bit_rate?: string;
  max_bit_rate?: string;
  bits_per_raw_sample?: string;
  nb_frames?: string;
  disposition?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  pix_fmt?: string;
  color_range?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
};

type FfprobeFormat = {
  filename?: string;
  nb_streams?: number;
  nb_programs?: number;
  format_name?: string;
  format_long_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  probe_score?: number;
  start_time?: string;
  tags?: Record<string, unknown>;
};

type FfprobeJson = {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
};

function parseFps(value: string | undefined): number | null {
  if (!value) return null;
  if (value.includes("/")) {
    const [a, b] = value.split("/");
    const num = Number(a);
    const den = Number(b);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return Number((num / den).toFixed(2));
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function resolveFfprobeCommand(): string {
  const envPath = process.env.FFPROBE_PATH?.trim();
  if (envPath) {
    return envPath;
  }

  if (process.platform === "win32") {
    const windowsDefault = "C:\\ffmpeg\\bin\\ffprobe.exe";
    if (existsSync(windowsDefault)) {
      return windowsDefault;
    }
  }

  return "ffprobe";
}

function runFfprobe(url: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      "-analyzeduration",
      "3000000",
      "-probesize",
      "3000000",
      url,
    ];
    const ffprobeCommand = resolveFfprobeCommand();
    const proc = spawn(ffprobeCommand, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`ffprobe timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`ffprobe exit ${code}. ${stderr || "no stderr"}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = requiredQuery(searchParams, "deviceId");
    const channelInput = requiredQuery(searchParams, "channel") ?? "1";
    const streamInput = requiredQuery(searchParams, "stream") ?? "0";
    const timeoutInput = requiredQuery(searchParams, "timeoutMs");
    const timeoutMs = Math.min(
      20000,
      Math.max(2000, timeoutInput ? Number.parseInt(timeoutInput, 10) : 6000),
    );

    if (!deviceId) {
      return fail("VALIDATION_ERROR", "deviceId is required", 400);
    }

    const channel = Number.parseInt(channelInput, 10);
    if (!Number.isFinite(channel) || channel < 1 || channel > 32) {
      return fail("VALIDATION_ERROR", "channel must be between 1 and 32", 400);
    }

    if (streamInput !== "0" && streamInput !== "1") {
      return fail("VALIDATION_ERROR", "stream must be 0 or 1", 400);
    }

    const { url } = await howenService.liveStreamUrl({
      deviceId,
      channel,
      stream: streamInput === "1" ? 1 : 0,
    });

    const startedAt = Date.now();
    const { stdout, stderr } = await runFfprobe(url, timeoutMs);
    const elapsedMs = Date.now() - startedAt;

    let parsed: FfprobeJson = {};
    try {
      parsed = JSON.parse(stdout) as FfprobeJson;
    } catch {
      parsed = {};
    }

    const video = parsed.streams?.find((s) => s.codec_type === "video");
    const audio = parsed.streams?.find((s) => s.codec_type === "audio");

    const payload = {
      source: "howen",
      deviceId,
      channel,
      stream: Number(streamInput),
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
      codec: video?.codec_name ?? null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      fps: parseFps(video?.avg_frame_rate ?? video?.r_frame_rate),
      pixelFormat: video?.pix_fmt ?? null,
      container: parsed.format?.format_name ?? null,
      bitRate: Number(video?.bit_rate ?? parsed.format?.bit_rate ?? 0) || null,
      startTime: parsed.format?.start_time ?? null,
      probeMs: elapsedMs,
      stderr: stderr.trim() || null,
      videoStream: video ?? null,
      audioStream: audio ?? null,
      ffprobe: parsed,
    };

    howenLogger.info("Probe completed", {
      deviceId,
      channel,
      stream: streamInput,
      hasVideo: payload.hasVideo,
      codec: payload.codec,
      probeMs: elapsedMs,
    });

    return ok(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "probe failed";
    howenLogger.error("Probe failed", { message });
    return Response.json(
      {
        success: false,
        error: {
          code: "PROBE_ERROR",
          message,
        },
      },
      { status: 502 },
    );
  }
}
