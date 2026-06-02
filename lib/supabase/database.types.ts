export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      canvases: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          state: Json;
          version: number;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title?: string;
          state?: Json;
          version?: number;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          state?: Json;
          version?: number;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "canvases_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      canvas_collaborators: {
        Row: {
          canvas_id: string;
          user_id: string;
          role: "owner" | "editor" | "viewer";
          invited_at: string;
        };
        Insert: {
          canvas_id: string;
          user_id: string;
          role: "owner" | "editor" | "viewer";
          invited_at?: string;
        };
        Update: {
          canvas_id?: string;
          user_id?: string;
          role?: "owner" | "editor" | "viewer";
          invited_at?: string;
        };
        Relationships: [];
      };
      // ----- v2 normalized schema (R1+) -----
      threads: {
        Row: {
          id: string;
          canvas_id: string;
          title: string | null;
          accent_color: string | null;
          root_component_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          canvas_id: string;
          title?: string | null;
          accent_color?: string | null;
          root_component_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["threads"]["Insert"]>;
        Relationships: [];
      };
      components: {
        Row: {
          id: string;
          canvas_id: string;
          thread_id: string;
          kind: ComponentKindDb;
          pos_x: number;
          pos_y: number;
          size_w: number | null;
          size_h: number | null;
          title: string | null;
          status: ComponentStatusDb;
          created_by_role: ComponentCreatedByRoleDb;
          created_by_user_id: string | null;
          updated_by_user_id: string | null;
          prompt: string | null;
          model_id: string | null;
          current_version_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          canvas_id: string;
          thread_id: string;
          kind: ComponentKindDb;
          pos_x: number;
          pos_y: number;
          size_w?: number | null;
          size_h?: number | null;
          title?: string | null;
          status?: ComponentStatusDb;
          created_by_role: ComponentCreatedByRoleDb;
          created_by_user_id?: string | null;
          updated_by_user_id?: string | null;
          prompt?: string | null;
          model_id?: string | null;
          current_version_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["components"]["Insert"]>;
        Relationships: [];
      };
      component_versions: {
        Row: {
          id: string;
          component_id: string;
          version_number: number;
          payload: Json;
          generated_from: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          component_id: string;
          version_number: number;
          payload: Json;
          generated_from?: Json | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["component_versions"]["Insert"]
        >;
        Relationships: [];
      };
      connections: {
        Row: {
          id: string;
          canvas_id: string;
          from_component_id: string;
          to_component_id: string;
          from_side: ConnectorSideDb;
          to_side: ConnectorSideDb;
          mode: ConnectionModeDb;
          created_by_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          canvas_id: string;
          from_component_id: string;
          to_component_id: string;
          from_side: ConnectorSideDb;
          to_side: ConnectorSideDb;
          mode?: ConnectionModeDb;
          created_by_user_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["connections"]["Insert"]>;
        Relationships: [];
      };
      attachments: {
        Row: {
          id: string;
          component_id: string | null;
          user_id: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          component_id?: string | null;
          user_id: string;
          storage_path: string;
          mime_type: string;
          size_bytes?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attachments"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// -----------------------------------------------------------------------------
// String-literal unions matching the CHECK constraints in the v2 migration.
// Kept self-contained in this file so the Database type doesn't depend on the
// higher-level component types added in R2. R2 re-exports these where useful.
// -----------------------------------------------------------------------------
export type ComponentKindDb =
  | "chat"
  | "text"
  | "image"
  | "gallery"
  | "table"
  | "code"
  | "chart"
  | "browser"
  | "3d"
  | "ui";

export type ComponentStatusDb =
  | "empty"
  | "thinking"
  | "streaming"
  | "done"
  | "error";

export type ComponentCreatedByRoleDb = "user" | "auto";

export type ConnectorSideDb = "top" | "bottom" | "left" | "right";

export type ConnectionModeDb = "visual" | "context" | "regenerate";
