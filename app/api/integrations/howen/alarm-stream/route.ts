import { getHowenConfig } from "@/lib/integrations/howen/config";
import { HowenClient } from "@/lib/integrations/howen/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveWsUrl(baseUrl: string): string {
  const explicit = process.env.HOWEN_WS_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const parsed = new URL(baseUrl);
  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${parsed.hostname}:36300/ws`;
}

type WsEnvelope = {
  action?: number | string;
  payload?: Record<string, unknown>;
};

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  const client = new HowenClient();
  const config = getHowenConfig();
  const session = await client.connect();
  const wsUrl = resolveWsUrl(config.baseUrl);

  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (text: string) => controller.enqueue(encoder.encode(text));
      const pushEvent = (event: string, data: unknown) => {
        push(`event: ${event}\n`);
        push(`data: ${JSON.stringify(data)}\n\n`);
      };

      const cleanup = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        ws = null;
      };

      push("retry: 2000\n\n");
      pushEvent("status", { state: "connecting", wsUrl });

      ws = new WebSocket(wsUrl);

      ws.addEventListener("open", () => {
        pushEvent("status", { state: "opened" });
        const loginMessage = {
          action: "80000",
          payload: {
            username: config.username,
            pid: session.pid,
            token: session.token,
          },
        };
        ws?.send(JSON.stringify(loginMessage));
      });

      ws.addEventListener("message", (event) => {
        try {
          const text = String(event.data ?? "");
          const message = JSON.parse(text) as WsEnvelope;
          const action = String(message.action ?? "");

          if (action === "80000") {
            const result = String(message.payload?.result ?? "").toLowerCase();
            if (result === "success") {
              pushEvent("status", { state: "authenticated" });
              ws?.send(JSON.stringify({ action: "80001", payload: "" }));
              if (!heartbeatTimer) {
                heartbeatTimer = setInterval(() => {
                  if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(
                      JSON.stringify({
                        action: "80009",
                        payload: {
                          username: config.username,
                          token: session.token,
                        },
                      }),
                    );
                  }
                }, 55_000);
              }
            } else {
              pushEvent("status", { state: "auth_failed", payload: message.payload ?? null });
            }
            return;
          }

          if (action === "80004") {
            pushEvent("alarm", message);
            return;
          }

          if (action === "80001") {
            pushEvent("status", { state: "subscribed", payload: message.payload ?? null });
            return;
          }
        } catch {
          pushEvent("status", { state: "parse_error" });
        }
      });

      ws.addEventListener("error", () => {
        pushEvent("status", { state: "socket_error" });
      });

      ws.addEventListener("close", () => {
        pushEvent("status", { state: "closed" });
        cleanup();
        controller.close();
      });

      keepAliveTimer = setInterval(() => {
        push(":keep-alive\n\n");
      }, 25_000);

      (controller as ReadableStreamDefaultController<Uint8Array> & {
        _cleanup?: () => void;
      })._cleanup = cleanup;
    },
    cancel() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      ws = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
