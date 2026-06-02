import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  ServiceComponent,
  ServiceConnection,
  ServiceThread,
} from "@/lib/services/types";
import { ComponentService } from "@/lib/services/ComponentService";
import { ConnectionService } from "@/lib/services/ConnectionService";

type Supabase = SupabaseClient<Database>;
type CanvasRow = Database["public"]["Tables"]["canvases"]["Row"];
type ThreadRow = Database["public"]["Tables"]["threads"]["Row"];

export interface ServiceCanvas {
  id: string;
  ownerId: string;
  title: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasSnapshotV2 {
  canvas: ServiceCanvas;
  threads: ServiceThread[];
  components: ServiceComponent[];
  connections: ServiceConnection[];
}

function rowToCanvas(row: CanvasRow): ServiceCanvas {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    isDefault: row.is_default,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function rowToThread(row: ThreadRow): ServiceThread {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    title: row.title,
    accentColor: row.accent_color,
    rootComponentId: row.root_component_id,
    createdAt: Date.parse(row.created_at),
  };
}

/**
 * Canvas lifecycle + read-side aggregation.
 *
 * R3 status: not yet used by the live canvas (which still reads from
 * canvases.state JSONB). R4 starts wiring loadSnapshot into the canvas
 * runtime; R8 cuts reads over fully.
 */
export class CanvasService {
  private readonly componentService: ComponentService;
  private readonly connectionService: ConnectionService;

  constructor(private readonly supabase: Supabase) {
    this.componentService = new ComponentService(supabase);
    this.connectionService = new ConnectionService(supabase);
  }

  async create(ownerId: string, title = "Untitled"): Promise<ServiceCanvas> {
    const { data, error } = await this.supabase
      .from("canvases")
      .insert({ owner_id: ownerId, title, is_default: false, state: {} })
      .select("*")
      .single();
    if (error) throw error;
    return rowToCanvas(data);
  }

  async get(canvasId: string): Promise<ServiceCanvas | null> {
    const { data, error } = await this.supabase
      .from("canvases")
      .select("*")
      .eq("id", canvasId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToCanvas(data) : null;
  }

  async listForOwner(ownerId: string): Promise<ServiceCanvas[]> {
    const { data, error } = await this.supabase
      .from("canvases")
      .select("*")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data.map(rowToCanvas);
  }

  async updateMeta(
    canvasId: string,
    patch: Partial<Pick<ServiceCanvas, "title">>,
  ): Promise<ServiceCanvas> {
    const update: Database["public"]["Tables"]["canvases"]["Update"] = {};
    if (patch.title !== undefined) update.title = patch.title;
    const { data, error } = await this.supabase
      .from("canvases")
      .update(update)
      .eq("id", canvasId)
      .select("*")
      .single();
    if (error) throw error;
    return rowToCanvas(data);
  }

  async delete(canvasId: string): Promise<void> {
    const { error } = await this.supabase
      .from("canvases")
      .delete()
      .eq("id", canvasId);
    if (error) throw error;
  }

  /**
   * One-shot read aggregation: load canvas + threads + components +
   * connections in parallel. The canvas runtime calls this on mount in R4+.
   */
  async loadSnapshot(canvasId: string): Promise<CanvasSnapshotV2 | null> {
    const canvas = await this.get(canvasId);
    if (!canvas) return null;

    const [threadsRes, components, connections] = await Promise.all([
      this.supabase.from("threads").select("*").eq("canvas_id", canvasId),
      this.componentService.list(canvasId),
      this.connectionService.listForCanvas(canvasId),
    ]);
    if (threadsRes.error) throw threadsRes.error;

    return {
      canvas,
      threads: threadsRes.data.map(rowToThread),
      components,
      connections,
    };
  }
}
