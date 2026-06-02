/**
 * GenerationService — orchestrates LLM generation for a component.
 *
 * R3 ships:
 *   - buildContext: REAL implementation. BFS ancestors via ConnectionService,
 *     fetch each ancestor's current payload, run through
 *     KindRegistry.serializeForContext, return ordered context chunks.
 *
 * R6 plugs in:
 *   - generate: dispatches by ComponentKind to per-kind generators (Claude
 *     for chat/text, Anthropic JSON for chart/ui, URL extraction for browser/3d).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { ConnectionService } from "@/lib/services/ConnectionService";
import { kindRegistry } from "@/lib/components/KindRegistry";
// Side-effect import: populates the registry before this service is used.
import "@/lib/components/kinds";
import type {
  ComponentKind,
  PayloadContextChunk,
} from "@/lib/types/component";
import type { ServiceComponent } from "@/lib/services/types";

type Supabase = SupabaseClient<Database>;

export interface GenerationInput {
  componentId: string;
  kind: ComponentKind;
  prompt: string;
  modelId?: string;
}

export interface GenerationResult {
  payload: Json;
  ancestorIds: string[];
  promptSnapshot: string;
  modelId: string;
}

/** A context chunk with metadata about which component contributed it. */
export interface AttributedContextChunk extends PayloadContextChunk {
  componentId: string;
  sourceKind: ComponentKind;
}

export interface ContextBundle {
  chunks: AttributedContextChunk[];
  ancestorIds: string[];
  ancestors: ServiceComponent[];
}

export class GenerationService {
  private readonly connectionService: ConnectionService;

  constructor(private readonly supabase: Supabase) {
    this.connectionService = new ConnectionService(supabase);
  }

  /**
   * Build the merged ancestor context for a component.
   *
   * 1. BFS upward via ConnectionService.resolveAncestors
   * 2. Batch-fetch each ancestor's current payload from component_versions
   * 3. For each ancestor, validate via the registered KindSpec, then run
   *    serializeForContext to produce ordered chunks
   * 4. Tag each chunk with componentId + sourceKind so downstream code can
   *    debug or selectively drop chunks
   */
  async buildContext(componentId: string): Promise<ContextBundle> {
    const ancestors = await this.connectionService.resolveAncestors(componentId);
    if (ancestors.length === 0) {
      return { chunks: [], ancestorIds: [], ancestors: [] };
    }

    const versionIds = ancestors
      .map((a) => a.currentVersionId)
      .filter((v): v is string => Boolean(v));

    const payloadById = new Map<string, Json>();
    if (versionIds.length > 0) {
      const { data, error } = await this.supabase
        .from("component_versions")
        .select("id, payload")
        .in("id", versionIds);
      if (error) throw error;
      for (const row of data as Array<{ id: string; payload: Json }>) {
        payloadById.set(row.id, row.payload);
      }
    }

    const chunks: AttributedContextChunk[] = [];
    for (const a of ancestors) {
      if (!a.currentVersionId) continue;
      const rawPayload = payloadById.get(a.currentVersionId);
      if (rawPayload === undefined) continue;
      if (!kindRegistry.has(a.kind)) continue;

      const spec = kindRegistry.get(a.kind);
      let payloadChunks: PayloadContextChunk[];
      try {
        // The validator narrows unknown → PayloadFor<K>, then we serialize.
        // Cast through unknown to bypass K-narrowing TS limitation when
        // looping over heterogeneous kinds.
        const validated = spec.validate(rawPayload);
        payloadChunks = (
          spec.serializeForContext as (p: unknown) => PayloadContextChunk[]
        )(validated);
      } catch (err) {
        // A malformed payload shouldn't poison the whole context bundle.
        // eslint-disable-next-line no-console
        console.warn(
          `[GenerationService.buildContext] ancestor ${a.id} (kind=${a.kind}) failed validation, skipping:`,
          err,
        );
        continue;
      }

      for (const chunk of payloadChunks) {
        chunks.push({
          ...chunk,
          componentId: a.id,
          sourceKind: a.kind,
        });
      }
    }

    return {
      chunks,
      ancestorIds: ancestors.map((a) => a.id),
      ancestors,
    };
  }

  /** R6: dispatch to per-kind generator. Stubbed until then so callers compile. */
  async generate(_input: GenerationInput): Promise<GenerationResult> {
    throw new Error(
      "GenerationService.generate is not implemented yet (lands in R6).",
    );
  }
}
