/**
 * R5c — Local store for v2-style manual connections.
 *
 * Session-scoped Zustand store holding connections created by the user via
 * the drag-to-connect gesture (R5b). Each entry carries the connection mode
 * (visual / context / regenerate) which the existing v1 Connection model
 * doesn't track.
 *
 * Scope intentionally narrow for R5c:
 *   - Local only (session memory). Survives in-canvas navigation; resets on
 *     page reload.
 *   - DB persistence happens via the existing dual-write loop in R6 once
 *     v1↔v2 ID mapping is resolved. For R5c the user can see + use the new
 *     connections immediately; they vanish on reload.
 *
 * R6 will:
 *   - Also push these into the v1 `connections` slice so the dual-write
 *     picks them up and writes v2 rows
 *   - For `mode === "regenerate"`, fire the regenerate API call
 */

import { create } from "zustand";
import type { ConnectionMode, ConnectorSide } from "@/lib/types/component";

export interface V2ManualConnection {
  id: string;
  /** v1 component id of the source (card id or canvas artifact node id). */
  fromComponentId: string;
  /** v1 component id of the target. */
  toComponentId: string;
  fromSide: ConnectorSide;
  toSide: ConnectorSide;
  mode: ConnectionMode;
  createdAt: number;
}

interface V2ConnectionsState {
  connections: Record<string, V2ManualConnection>;
  /** Render order, newest last. */
  order: string[];
  /**
   * Add a manual connection. Optional `id` lets the caller use the same id
   * for the v1 connections slice mirror (R6a) so the two stay in lockstep.
   */
  add: (
    conn: Omit<V2ManualConnection, "id" | "createdAt">,
    id?: string,
  ) => string;
  remove: (id: string) => void;
  clear: () => void;
  /** Check membership — used by Connections.tsx to skip mirrored entries. */
  has: (id: string) => boolean;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `v2c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useV2ConnectionsStore = create<V2ConnectionsState>((set, get) => ({
  connections: {},
  order: [],
  add: (input, providedId) => {
    const id = providedId ?? generateId();
    const conn: V2ManualConnection = {
      id,
      createdAt: Date.now(),
      ...input,
    };
    set((s) => ({
      connections: { ...s.connections, [id]: conn },
      order: s.order.includes(id) ? s.order : [...s.order, id],
    }));
    return id;
  },
  has: (id) => Boolean(get().connections[id]),
  remove: (id) =>
    set((s) => {
      if (!s.connections[id]) return s;
      const next = { ...s.connections };
      delete next[id];
      return {
        connections: next,
        order: s.order.filter((x) => x !== id),
      };
    }),
  clear: () => set({ connections: {}, order: [] }),
}));
