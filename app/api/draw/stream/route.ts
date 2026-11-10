import { getDb } from "@/lib/db";
import { subscribeToDraw, type DrawState } from "@/lib/draw/hub";
import { clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_STREAMS = 500;
const MAX_PER_CLIENT = 6;
const LIFETIME_MS = 55_000;
let open = 0;
const perClient = new Map<string, number>();

/**
 * Server-sent events so every viewer learns about the official draw at the same moment. The stream carries
 * only the draw's state (none / published, its id and reveal time), never the draw itself; clients fetch the
 * saved result from /api/draw/official. Connections end after a minute and the browser reconnects, which keeps
 * proxies and instances from holding stale sockets. Clients that cannot stream fall back to polling.
 */
export async function GET(request: Request) {
  const client = clientKey(request);
  if (open >= MAX_STREAMS || (perClient.get(client) ?? 0) >= MAX_PER_CLIENT) {
    return new Response("Too many live connections. Polling still works.", { status: 429, headers: { "retry-after": "15" } });
  }
  const db = await getDb();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      open += 1;
      perClient.set(client, (perClient.get(client) ?? 0) + 1);
      let closed = false;
      let lastKey = "";
      let lastSent = 0;

      const write = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearTimeout(lifetime);
        open = Math.max(0, open - 1);
        const remaining = (perClient.get(client) ?? 1) - 1;
        if (remaining <= 0) perClient.delete(client);
        else perClient.set(client, remaining);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      cleanup = close;

      write("retry: 3000\n\n");
      const unsubscribe = subscribeToDraw(db, (state: DrawState) => {
        const key = `${state.state}:${state.id}:${state.publishedAt}`;
        const now = Date.now();
        if (key !== lastKey) {
          lastKey = key;
          lastSent = now;
          write(`event: draw\ndata: ${JSON.stringify(state)}\n\n`);
        } else if (now - lastSent > 15_000) {
          lastSent = now;
          write(`event: tick\ndata: ${JSON.stringify({ serverTime: state.serverTime })}\n\n`);
        }
      });
      const lifetime = setTimeout(close, LIFETIME_MS);
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
