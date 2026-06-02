import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  CreateConnectionInput,
  ServiceComponent,
  ServiceConnection,
} from "@/lib/services/types";

type Supabase = SupabaseClient<Database>;
type ConnectionRow = Database["public"]["Tables"]["connections"]["Row"];
type ComponentRow = Database["public"]["Tables"]["components"]["Row"];

function rowToConnection(row: ConnectionRow): ServiceConnection {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    fromComponentId: row.from_component_id,
    toComponentId: row.to_component_id,
    fromSide: row.from_side,
    toSide: row.to_side,
    mode: row.mode,
    createdByUserId: row.created_by_user_id,
    createdAt: Date.parse(row.created_at),
  };
}

function rowToComponent(row: ComponentRow): ServiceComponent {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    threadId: row.thread_id,
    kind: row.kind,
    position: { x: row.pos_x, y: row.pos_y },
    size: { w: row.size_w, h: row.size_h },
    title: row.title,
    status: row.status,
    createdByRole: row.created_by_role,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    prompt: row.prompt,
    modelId: row.model_id,
    currentVersionId: row.current_version_id,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

/**
 * Graph operations over the components DAG.
 *
 * link() enforces no cycles (caller may pre-check with detectCycles).
 * resolveAncestors() BFS-walks up the graph and is the workhorse for
 * GenerationService.buildContext (R6).
 */
export class ConnectionService {
  constructor(private readonly supabase: Supabase) {}

  async link(input: CreateConnectionInput): Promise<ServiceConnection> {
    if (input.fromComponentId === input.toComponentId) {
      throw new Error("Cannot link a component to itself.");
    }
    if (await this.detectCycles(input.fromComponentId, input.toComponentId)) {
      throw new Error(
        "Refusing to create connection: would introduce a cycle in the graph.",
      );
    }

    const { data, error } = await this.supabase
      .from("connections")
      .insert({
        canvas_id: input.canvasId,
        from_component_id: input.fromComponentId,
        to_component_id: input.toComponentId,
        from_side: input.fromSide,
        to_side: input.toSide,
        mode: input.mode ?? "context",
        created_by_user_id: input.createdByUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return rowToConnection(data);
  }

  async unlink(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("connections")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  async listForComponent(id: string): Promise<{
    incoming: ServiceConnection[];
    outgoing: ServiceConnection[];
  }> {
    const [{ data: incoming, error: inErr }, { data: outgoing, error: outErr }] =
      await Promise.all([
        this.supabase
          .from("connections")
          .select("*")
          .eq("to_component_id", id),
        this.supabase
          .from("connections")
          .select("*")
          .eq("from_component_id", id),
      ]);
    if (inErr) throw inErr;
    if (outErr) throw outErr;
    return {
      incoming: incoming.map(rowToConnection),
      outgoing: outgoing.map(rowToConnection),
    };
  }

  async listForCanvas(canvasId: string): Promise<ServiceConnection[]> {
    const { data, error } = await this.supabase
      .from("connections")
      .select("*")
      .eq("canvas_id", canvasId);
    if (error) throw error;
    return data.map(rowToConnection);
  }

  /**
   * Walk the connection graph upward from `componentId` via incoming edges.
   * BFS, visited set, capped by `maxDepth` (default 16).
   * Returns ancestors in BFS order — immediate parents first.
   */
  async resolveAncestors(
    componentId: string,
    maxDepth = 16,
  ): Promise<ServiceComponent[]> {
    const visited = new Set<string>([componentId]);
    const result: ServiceComponent[] = [];
    let frontier: string[] = [componentId];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const { data: edges, error } = await this.supabase
        .from("connections")
        .select("from_component_id, to_component_id")
        .in("to_component_id", frontier);
      if (error) throw error;

      const nextIds: string[] = [];
      for (const e of edges) {
        if (!visited.has(e.from_component_id)) {
          visited.add(e.from_component_id);
          nextIds.push(e.from_component_id);
        }
      }
      if (nextIds.length === 0) break;

      const { data: parents, error: pErr } = await this.supabase
        .from("components")
        .select("*")
        .in("id", nextIds);
      if (pErr) throw pErr;
      for (const p of parents) result.push(rowToComponent(p));

      frontier = nextIds;
    }

    return result;
  }

  /**
   * Returns true if creating an edge `from → to` would create a cycle,
   * i.e. `from` is reachable from `to` by following outgoing edges.
   */
  async detectCycles(fromId: string, toId: string): Promise<boolean> {
    const visited = new Set<string>([toId]);
    let frontier: string[] = [toId];
    while (frontier.length > 0) {
      const { data: edges, error } = await this.supabase
        .from("connections")
        .select("to_component_id")
        .in("from_component_id", frontier);
      if (error) throw error;

      const next: string[] = [];
      for (const e of edges) {
        if (e.to_component_id === fromId) return true;
        if (!visited.has(e.to_component_id)) {
          visited.add(e.to_component_id);
          next.push(e.to_component_id);
        }
      }
      frontier = next;
    }
    return false;
  }
}
