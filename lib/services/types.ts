/**
 * Service-layer types for the v2 normalized schema.
 *
 * These are DB-shaped (camelCase TS, payload still as raw Json) — distinct
 * from R2's typed `Component<K>` in /lib/types/component.ts which has the
 * full discriminated payload. Service classes return these; R4 narrows them
 * to `Component<K>` at the UI boundary by passing the payload through
 * `kindRegistry.get(kind).validate(payload)`.
 *
 * Reason for the split:
 *   - Service layer doesn't want to know about KindRegistry at runtime.
 *   - Untyped payload here keeps DB ops mechanical and registry-agnostic.
 *   - UI layer pays the validation cost once per render, not once per query.
 */

import type {
  ComponentKindDb,
  ComponentStatusDb,
  ComponentCreatedByRoleDb,
  ConnectorSideDb,
  ConnectionModeDb,
  Json,
} from "@/lib/supabase/database.types";

export type ComponentKind = ComponentKindDb;
export type ComponentStatus = ComponentStatusDb;
export type ComponentCreatedByRole = ComponentCreatedByRoleDb;
export type ConnectorSide = ConnectorSideDb;
export type ConnectionMode = ConnectionModeDb;

export interface ServiceComponent {
  id: string;
  canvasId: string;
  threadId: string;
  kind: ComponentKind;
  position: { x: number; y: number };
  size: { w: number | null; h: number | null };
  title: string | null;
  status: ComponentStatus;
  createdByRole: ComponentCreatedByRole;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  prompt: string | null;
  modelId: string | null;
  currentVersionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ServiceComponentVersion {
  id: string;
  componentId: string;
  versionNumber: number;
  payload: Json;
  generatedFrom: Json | null;
  createdAt: number;
}

export interface ServiceConnection {
  id: string;
  canvasId: string;
  fromComponentId: string;
  toComponentId: string;
  fromSide: ConnectorSide;
  toSide: ConnectorSide;
  mode: ConnectionMode;
  createdByUserId: string | null;
  createdAt: number;
}

export interface ServiceThread {
  id: string;
  canvasId: string;
  title: string | null;
  accentColor: string | null;
  rootComponentId: string | null;
  createdAt: number;
}

export interface CreateComponentInput {
  canvasId: string;
  threadId: string;
  kind: ComponentKind;
  position: { x: number; y: number };
  size?: { w?: number | null; h?: number | null };
  title?: string | null;
  status?: ComponentStatus;
  createdByRole: ComponentCreatedByRole;
  createdByUserId?: string | null;
  prompt?: string | null;
  modelId?: string | null;
  /** If provided, an initial component_versions row (version 1) is created. */
  initialPayload?: Json;
}

export interface CreateConnectionInput {
  canvasId: string;
  fromComponentId: string;
  toComponentId: string;
  fromSide: ConnectorSide;
  toSide: ConnectorSide;
  mode?: ConnectionMode;
  createdByUserId?: string | null;
}

export interface GenerationContext {
  /** Ancestor component IDs whose payloads were merged into this generation. */
  ancestorIds: string[];
  /** The prompt sent to the model for this generation. */
  promptSnapshot: string;
  /** Identifier of the model used. */
  modelId: string;
}
