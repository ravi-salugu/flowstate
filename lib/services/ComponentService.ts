import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  CreateComponentInput,
  GenerationContext,
  ServiceComponent,
  ServiceComponentVersion,
} from "@/lib/services/types";

type Supabase = SupabaseClient<Database>;
type ComponentRow = Database["public"]["Tables"]["components"]["Row"];
type ComponentVersionRow =
  Database["public"]["Tables"]["component_versions"]["Row"];

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

function rowToVersion(row: ComponentVersionRow): ServiceComponentVersion {
  return {
    id: row.id,
    componentId: row.component_id,
    versionNumber: row.version_number,
    payload: row.payload,
    generatedFrom: row.generated_from,
    createdAt: Date.parse(row.created_at),
  };
}

/**
 * CRUD + versioning for components. One per request with the appropriate
 * (browser or server) Supabase client.
 */
export class ComponentService {
  constructor(private readonly supabase: Supabase) {}

  /**
   * Create a component. If `initialPayload` is provided, also creates the
   * first component_versions row (version_number=1) and sets it as
   * current_version_id via a follow-up update.
   */
  async create(input: CreateComponentInput): Promise<ServiceComponent> {
    const { data: inserted, error } = await this.supabase
      .from("components")
      .insert({
        canvas_id: input.canvasId,
        thread_id: input.threadId,
        kind: input.kind,
        pos_x: input.position.x,
        pos_y: input.position.y,
        size_w: input.size?.w ?? null,
        size_h: input.size?.h ?? null,
        title: input.title ?? null,
        status: input.status ?? "done",
        created_by_role: input.createdByRole,
        created_by_user_id: input.createdByUserId ?? null,
        prompt: input.prompt ?? null,
        model_id: input.modelId ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;

    if (input.initialPayload !== undefined) {
      const { data: ver, error: verErr } = await this.supabase
        .from("component_versions")
        .insert({
          component_id: inserted.id,
          version_number: 1,
          payload: input.initialPayload,
        })
        .select("*")
        .single();
      if (verErr) throw verErr;

      const { data: updated, error: upErr } = await this.supabase
        .from("components")
        .update({ current_version_id: ver.id })
        .eq("id", inserted.id)
        .select("*")
        .single();
      if (upErr) throw upErr;
      return rowToComponent(updated);
    }

    return rowToComponent(inserted);
  }

  async update(
    id: string,
    patch: Partial<ServiceComponent>,
  ): Promise<ServiceComponent> {
    const update: Database["public"]["Tables"]["components"]["Update"] = {};
    if (patch.position) {
      update.pos_x = patch.position.x;
      update.pos_y = patch.position.y;
    }
    if (patch.size) {
      update.size_w = patch.size.w;
      update.size_h = patch.size.h;
    }
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.prompt !== undefined) update.prompt = patch.prompt;
    if (patch.modelId !== undefined) update.model_id = patch.modelId;
    if (patch.currentVersionId !== undefined) {
      update.current_version_id = patch.currentVersionId;
    }
    if (patch.updatedByUserId !== undefined) {
      update.updated_by_user_id = patch.updatedByUserId;
    }

    const { data, error } = await this.supabase
      .from("components")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return rowToComponent(data);
  }

  /**
   * Produce a new component_versions row and point current_version_id at it.
   * Caller supplies the new payload (already validated against KindRegistry
   * in the call site).
   */
  async regenerate(
    id: string,
    payload: Json,
    ctx: GenerationContext,
  ): Promise<{
    component: ServiceComponent;
    version: ServiceComponentVersion;
  }> {
    // Find next version_number
    const { data: existing, error: countErr } = await this.supabase
      .from("component_versions")
      .select("version_number")
      .eq("component_id", id)
      .order("version_number", { ascending: false })
      .limit(1);
    if (countErr) throw countErr;
    const nextNumber = (existing?.[0]?.version_number ?? 0) + 1;

    const { data: ver, error: verErr } = await this.supabase
      .from("component_versions")
      .insert({
        component_id: id,
        version_number: nextNumber,
        payload,
        generated_from: {
          ancestorIds: ctx.ancestorIds,
          promptSnapshot: ctx.promptSnapshot,
          modelId: ctx.modelId,
        } as Json,
      })
      .select("*")
      .single();
    if (verErr) throw verErr;

    const { data: comp, error: compErr } = await this.supabase
      .from("components")
      .update({ current_version_id: ver.id })
      .eq("id", id)
      .select("*")
      .single();
    if (compErr) throw compErr;

    return {
      component: rowToComponent(comp),
      version: rowToVersion(ver),
    };
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("components")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  async list(canvasId: string): Promise<ServiceComponent[]> {
    const { data, error } = await this.supabase
      .from("components")
      .select("*")
      .eq("canvas_id", canvasId);
    if (error) throw error;
    return data.map(rowToComponent);
  }

  async getVersionHistory(id: string): Promise<ServiceComponentVersion[]> {
    const { data, error } = await this.supabase
      .from("component_versions")
      .select("*")
      .eq("component_id", id)
      .order("version_number", { ascending: false });
    if (error) throw error;
    return data.map(rowToVersion);
  }

  async revertToVersion(
    id: string,
    versionId: string,
  ): Promise<ServiceComponent> {
    const { data, error } = await this.supabase
      .from("components")
      .update({ current_version_id: versionId })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return rowToComponent(data);
  }
}
