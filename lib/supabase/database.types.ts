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
          allow_viewer_duplicate: boolean;
          created_at: string;
          updated_at: string;
          content_edited_at: string | null;
          thumbnail_url: string | null;
          source_canvas_id: string | null;
          source_published_slug: string | null;
          source_published_version: number | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title?: string;
          state?: Json;
          version?: number;
          is_default?: boolean;
          allow_viewer_duplicate?: boolean;
          created_at?: string;
          updated_at?: string;
          content_edited_at?: string | null;
          thumbnail_url?: string | null;
          source_canvas_id?: string | null;
          source_published_slug?: string | null;
          source_published_version?: number | null;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          state?: Json;
          version?: number;
          is_default?: boolean;
          allow_viewer_duplicate?: boolean;
          created_at?: string;
          updated_at?: string;
          content_edited_at?: string | null;
          thumbnail_url?: string | null;
          source_canvas_id?: string | null;
          source_published_slug?: string | null;
          source_published_version?: number | null;
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
      canvas_invites: {
        Row: {
          id: string;
          canvas_id: string;
          email: string;
          role: "editor" | "viewer";
          invited_by: string;
          status: "pending" | "accepted" | "declined";
          created_at: string;
        };
        Insert: {
          id?: string;
          canvas_id: string;
          email: string;
          role: "editor" | "viewer";
          invited_by: string;
          status?: "pending" | "accepted" | "declined";
          created_at?: string;
        };
        Update: {
          id?: string;
          canvas_id?: string;
          email?: string;
          role?: "editor" | "viewer";
          invited_by?: string;
          status?: "pending" | "accepted" | "declined";
          created_at?: string;
        };
        Relationships: [];
      };
      canvas_share_links: {
        Row: {
          id: string;
          canvas_id: string;
          token: string;
          created_by: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          canvas_id: string;
          token?: string;
          created_by: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          canvas_id?: string;
          token?: string;
          created_by?: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      google_connections: {
        Row: {
          user_id: string;
          google_email: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          expires_at: string;
          scopes: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          google_email: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          expires_at: string;
          scopes?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          google_email?: string;
          access_token_encrypted?: string;
          refresh_token_encrypted?: string;
          expires_at?: string;
          scopes?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      beta_suggestions: {
        Row: {
          id: string;
          user_id: string | null;
          user_email: string;
          page_url: string | null;
          message: string;
          image_urls: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          user_email?: string;
          page_url?: string | null;
          message: string;
          image_urls?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          user_email?: string;
          page_url?: string | null;
          message?: string;
          image_urls?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      usage_analysis_snapshots: {
        Row: {
          id: string;
          computed_at: string;
          timezone: string;
          payload: Json;
          stats: Json;
        };
        Insert: {
          id?: string;
          computed_at?: string;
          timezone?: string;
          payload: Json;
          stats?: Json;
        };
        Update: {
          id?: string;
          computed_at?: string;
          timezone?: string;
          payload?: Json;
          stats?: Json;
        };
        Relationships: [];
      };
      visitor_events: {
        Row: {
          id: string;
          created_at: string;
          visitor_id: string;
          path: string | null;
          is_authenticated: boolean;
          referrer_host: string | null;
          source: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          country: string | null;
          region: string | null;
          city: string | null;
          world_region: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          visitor_id: string;
          path?: string | null;
          is_authenticated?: boolean;
          referrer_host?: string | null;
          source?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          country?: string | null;
          region?: string | null;
          city?: string | null;
          world_region?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          visitor_id?: string;
          path?: string | null;
          is_authenticated?: boolean;
          referrer_host?: string | null;
          source?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          country?: string | null;
          region?: string | null;
          city?: string | null;
          world_region?: string | null;
        };
        Relationships: [];
      };
      mcp_servers: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          enabled: boolean;
          transport: "http" | "stdio";
          url: string | null;
          auth_type: "none" | "headers" | "oauth";
          headers_encrypted: string | null;
          stdio_command: string | null;
          stdio_args: Json | null;
          stdio_env_encrypted: string | null;
          tools_cache: Json | null;
          tools_cached_at: string | null;
          last_status: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          enabled?: boolean;
          transport?: "http" | "stdio";
          url?: string | null;
          auth_type?: "none" | "headers" | "oauth";
          headers_encrypted?: string | null;
          stdio_command?: string | null;
          stdio_args?: Json | null;
          stdio_env_encrypted?: string | null;
          tools_cache?: Json | null;
          tools_cached_at?: string | null;
          last_status?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          enabled?: boolean;
          transport?: "http" | "stdio";
          url?: string | null;
          auth_type?: "none" | "headers" | "oauth";
          headers_encrypted?: string | null;
          stdio_command?: string | null;
          stdio_args?: Json | null;
          stdio_env_encrypted?: string | null;
          tools_cache?: Json | null;
          tools_cached_at?: string | null;
          last_status?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mcp_oauth_connections: {
        Row: {
          server_id: string;
          user_id: string;
          access_token_encrypted: string | null;
          refresh_token_encrypted: string | null;
          expires_at: string | null;
          scopes: string[];
          client_info_encrypted: string | null;
          code_verifier_encrypted: string | null;
          oauth_state: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          server_id: string;
          user_id: string;
          access_token_encrypted?: string | null;
          refresh_token_encrypted?: string | null;
          expires_at?: string | null;
          scopes?: string[];
          client_info_encrypted?: string | null;
          code_verifier_encrypted?: string | null;
          oauth_state?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          server_id?: string;
          user_id?: string;
          access_token_encrypted?: string | null;
          refresh_token_encrypted?: string | null;
          expires_at?: string | null;
          scopes?: string[];
          client_info_encrypted?: string | null;
          code_verifier_encrypted?: string | null;
          oauth_state?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mcp_tool_grants: {
        Row: {
          user_id: string;
          server_id: string;
          tool_name: string;
          decision: "always" | "deny";
          tool_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          server_id: string;
          tool_name: string;
          decision: "always" | "deny";
          tool_hash: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          server_id?: string;
          tool_name?: string;
          decision?: "always" | "deny";
          tool_hash?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mcp_approval_requests: {
        Row: {
          id: string;
          user_id: string;
          server_id: string;
          tool_name: string;
          input_preview: Json | null;
          tool_hash: string;
          status: "pending" | "allow_once" | "always" | "deny" | "cancelled" | "expired";
          created_at: string;
          decided_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          server_id: string;
          tool_name: string;
          input_preview?: Json | null;
          tool_hash: string;
          status?: "pending" | "allow_once" | "always" | "deny" | "cancelled" | "expired";
          created_at?: string;
          decided_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          server_id?: string;
          tool_name?: string;
          input_preview?: Json | null;
          tool_hash?: string;
          status?: "pending" | "allow_once" | "always" | "deny" | "cancelled" | "expired";
          created_at?: string;
          decided_at?: string | null;
        };
        Relationships: [];
      };
      user_memories: {
        Row: {
          user_id: string;
          content: string;
          pending_notes: string;
          turn_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          content?: string;
          pending_notes?: string;
          turn_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          content?: string;
          pending_notes?: string;
          turn_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      qa_turn_events: {
        Row: {
          id: string;
          created_at: string;
          card_id: string | null;
          canvas_id: string | null;
          owner_id: string | null;
          question: string | null;
          model: string | null;
          duration_ms: number | null;
          input_tokens: number | null;
          output_tokens: number | null;
          cache_read_tokens: number;
          cache_creation_tokens: number;
          tool_turns: number | null;
          pause_turns: number | null;
          web_search_blocks: number | null;
          artifact_kind: string | null;
          outcome: string;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          card_id?: string | null;
          canvas_id?: string | null;
          owner_id?: string | null;
          question?: string | null;
          model?: string | null;
          duration_ms?: number | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_read_tokens?: number;
          cache_creation_tokens?: number;
          tool_turns?: number | null;
          pause_turns?: number | null;
          web_search_blocks?: number | null;
          artifact_kind?: string | null;
          outcome: string;
          error_message?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          card_id?: string | null;
          canvas_id?: string | null;
          owner_id?: string | null;
          question?: string | null;
          model?: string | null;
          duration_ms?: number | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_read_tokens?: number;
          cache_creation_tokens?: number;
          tool_turns?: number | null;
          pause_turns?: number | null;
          web_search_blocks?: number | null;
          artifact_kind?: string | null;
          outcome?: string;
          error_message?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "qa_turn_events_canvas_id_fkey";
            columns: ["canvas_id"];
            isOneToOne: false;
            referencedRelation: "canvases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_turn_events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_ledger: {
        Row: {
          id: string;
          created_at: string;
          owner_id: string | null;
          visitor_id: string | null;
          period_start: string;
          kind: string;
          hold_id: string | null;
          credits: number;
          surface: string;
          provider: string | null;
          model: string | null;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_creation_tokens: number;
          web_searches: number;
          units: number;
          duration_ms: number | null;
          cost_usd: number | null;
          pricing_version: string;
          canvas_id: string | null;
          card_id: string | null;
          outcome: string | null;
          expires_at: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          owner_id?: string | null;
          visitor_id?: string | null;
          period_start: string;
          kind: string;
          hold_id?: string | null;
          credits: number;
          surface: string;
          provider?: string | null;
          model?: string | null;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          cache_creation_tokens?: number;
          web_searches?: number;
          units?: number;
          duration_ms?: number | null;
          cost_usd?: number | null;
          pricing_version: string;
          canvas_id?: string | null;
          card_id?: string | null;
          outcome?: string | null;
          expires_at?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["usage_ledger"]["Insert"]>;
        Relationships: [];
      };
      usage_counters: {
        Row: {
          owner_id: string;
          period_start: string;
          period_end: string;
          credits_used: number;
          credits_reserved: number;
          cost_usd: number;
          events: number;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          period_start: string;
          period_end: string;
          credits_used?: number;
          credits_reserved?: number;
          cost_usd?: number;
          events?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["usage_counters"]["Insert"]>;
        Relationships: [];
      };
      user_entitlements: {
        Row: {
          owner_id: string;
          owner_type: string;
          plan_id: string;
          status: string;
          credits_per_period: number;
          bonus_credits: number;
          period_start: string;
          period_end: string;
          cancel_at_period_end: boolean;
          pending_plan_id: string | null;
          pending_effective_at: string | null;
          provider: string;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          provider_price_id: string | null;
          grace_until: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          owner_type?: string;
          plan_id?: string;
          status?: string;
          credits_per_period?: number;
          bonus_credits?: number;
          period_start?: string;
          period_end?: string;
          cancel_at_period_end?: boolean;
          pending_plan_id?: string | null;
          pending_effective_at?: string | null;
          provider?: string;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          provider_price_id?: string | null;
          grace_until?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_entitlements"]["Insert"]>;
        Relationships: [];
      };
      billing_events: {
        Row: {
          id: string;
          provider: string;
          event_id: string;
          type: string | null;
          owner_id: string | null;
          payload: Json;
          received_at: string;
          processed_at: string | null;
          error: string | null;
        };
        Insert: {
          id?: string;
          provider: string;
          event_id: string;
          type?: string | null;
          owner_id?: string | null;
          payload?: Json;
          received_at?: string;
          processed_at?: string | null;
          error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["billing_events"]["Insert"]>;
        Relationships: [];
      };
      guest_credit_counters: {
        Row: {
          visitor_id: string;
          ip_hash: string | null;
          credits_used: number;
          requests: number;
          window_start: string;
          last_seen_at: string;
        };
        Insert: {
          visitor_id: string;
          ip_hash?: string | null;
          credits_used?: number;
          requests?: number;
          window_start?: string;
          last_seen_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guest_credit_counters"]["Insert"]>;
        Relationships: [];
      };
      published_canvases: {
        Row: {
          id: string;
          slug: string;
          source_canvas_id: string;
          owner_id: string;
          owner_display_name: string | null;
          owner_avatar_url: string | null;
          title: string;
          description: string | null;
          og_image_url: string | null;
          current_version: number;
          visibility: "unlisted" | "public" | "revoked";
          featured_at: string | null;
          view_count: number;
          copy_count: number;
          published_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          source_canvas_id: string;
          owner_id: string;
          owner_display_name?: string | null;
          owner_avatar_url?: string | null;
          title: string;
          description?: string | null;
          og_image_url?: string | null;
          current_version?: number;
          visibility?: "unlisted" | "public" | "revoked";
          featured_at?: string | null;
          view_count?: number;
          copy_count?: number;
          published_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["published_canvases"]["Insert"]>;
        Relationships: [];
      };
      published_canvas_versions: {
        Row: {
          id: string;
          published_canvas_id: string;
          version: number;
          state: Json;
          snapshot_version: number;
          byte_size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          published_canvas_id: string;
          version: number;
          state: Json;
          snapshot_version?: number;
          byte_size?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["published_canvas_versions"]["Insert"]
        >;
        Relationships: [];
      };
      published_canvas_views: {
        Row: {
          published_canvas_id: string;
          visitor_id: string;
          day: string;
        };
        Insert: {
          published_canvas_id: string;
          visitor_id: string;
          day?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["published_canvas_views"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_beta_suggestion: {
        Args: {
          p_message: string;
          p_page_url?: string | null;
          p_image_urls?: string[];
        };
        Returns: string;
      };
      join_canvas_via_share_token: {
        Args: { p_token: string };
        Returns: string | null;
      };
      accept_canvas_invite: {
        Args: { p_invite_id: string };
        Returns: string;
      };
      process_pending_canvas_invites: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      get_published_canvas_meta: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          owner_display_name: string | null;
          owner_avatar_url: string | null;
          og_image_url: string | null;
          current_version: number;
          published_at: string;
          updated_at: string;
        }[];
      };
      get_published_canvas_state: {
        Args: { p_slug: string; p_version: number };
        Returns: Json | null;
      };
      record_published_canvas_copy: {
        Args: { p_slug: string };
        Returns: undefined;
      };
      increment_published_view: {
        Args: { p_published_canvas_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
