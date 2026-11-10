import type { Db } from "../db";
import { getDrawState } from "./service";

export type DrawState = Awaited<ReturnType<typeof getDrawState>> & { serverTime: string };

type Listener = (state: DrawState) => void;

type Hub = {
  listeners: Set<Listener>;
  timer: ReturnType<typeof setInterval> | null;
  busy: boolean;
};

const globalHub = globalThis as typeof globalThis & { __nclDrawHub?: Hub };
const hub: Hub = (globalHub.__nclDrawHub ??= { listeners: new Set(), timer: null, busy: false });

/**
 * One database poll per server, shared by every connected viewer, so a crowd watching the draw costs one
 * small query every two seconds rather than one per person. Viewers also receive a periodic heartbeat state.
 */
export function subscribeToDraw(db: Db, listener: Listener): () => void {
  hub.listeners.add(listener);
  if (!hub.timer) {
    const poll = async () => {
      if (hub.busy) return;
      hub.busy = true;
      try {
        const state = await getDrawState(db);
        const full: DrawState = { ...state, serverTime: new Date().toISOString() };
        for (const notify of hub.listeners) notify(full);
      } catch {
        // A failed poll is retried on the next tick; viewers keep their last state.
      } finally {
        hub.busy = false;
      }
    };
    void poll();
    hub.timer = setInterval(poll, 2_000);
  }
  return () => {
    hub.listeners.delete(listener);
    if (hub.listeners.size === 0 && hub.timer) {
      clearInterval(hub.timer);
      hub.timer = null;
    }
  };
}

export function liveViewerCount(): number {
  return hub.listeners.size;
}
