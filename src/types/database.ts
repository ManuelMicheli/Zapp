export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      episode_watches: {
        Row: {
          episode_number: number;
          id: string;
          season_number: number;
          title_id: number;
          user_id: string;
          watched_at: string;
        };
        Insert: {
          episode_number: number;
          id?: string;
          season_number: number;
          title_id: number;
          user_id: string;
          watched_at?: string;
        };
        Update: {
          episode_number?: number;
          id?: string;
          season_number?: number;
          title_id?: number;
          user_id?: string;
          watched_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "episode_watches_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          is_private: boolean;
          onboarding_completed_at: string | null;
          updated_at: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          is_private?: boolean;
          onboarding_completed_at?: string | null;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_private?: boolean;
          onboarding_completed_at?: string | null;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      title_provider_links: {
        Row: {
          media_type: Database["public"]["Enums"]["media_type"];
          provider_id: number;
          resolved_at: string;
          source: string;
          title_id: number;
          url: string;
        };
        Insert: {
          media_type: Database["public"]["Enums"]["media_type"];
          provider_id: number;
          resolved_at?: string;
          source: string;
          title_id: number;
          url: string;
        };
        Update: {
          media_type?: Database["public"]["Enums"]["media_type"];
          provider_id?: number;
          resolved_at?: string;
          source?: string;
          title_id?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "title_provider_links_title_id_media_type_fkey";
            columns: ["title_id", "media_type"];
            isOneToOne: false;
            referencedRelation: "titles";
            referencedColumns: ["id", "media_type"];
          },
        ];
      };
      title_providers: {
        Row: {
          fetched_at: string;
          kind: string;
          logo_path: string | null;
          media_type: Database["public"]["Enums"]["media_type"];
          provider_id: number;
          provider_name: string;
          title_id: number;
        };
        Insert: {
          fetched_at?: string;
          kind: string;
          logo_path?: string | null;
          media_type: Database["public"]["Enums"]["media_type"];
          provider_id: number;
          provider_name: string;
          title_id: number;
        };
        Update: {
          fetched_at?: string;
          kind?: string;
          logo_path?: string | null;
          media_type?: Database["public"]["Enums"]["media_type"];
          provider_id?: number;
          provider_name?: string;
          title_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "title_providers_title_id_media_type_fkey";
            columns: ["title_id", "media_type"];
            isOneToOne: false;
            referencedRelation: "titles";
            referencedColumns: ["id", "media_type"];
          },
        ];
      };
      titles: {
        Row: {
          backdrop_path: string | null;
          external_ids: Json | null;
          fetched_at: string;
          genres: Json | null;
          id: number;
          media_type: Database["public"]["Enums"]["media_type"];
          number_of_episodes: number | null;
          number_of_seasons: number | null;
          original_title: string | null;
          overview: string | null;
          poster_path: string | null;
          raw: Json | null;
          release_date: string | null;
          runtime: number | null;
          title: string;
          vote_average: number | null;
          vote_count: number | null;
        };
        Insert: {
          backdrop_path?: string | null;
          external_ids?: Json | null;
          fetched_at?: string;
          genres?: Json | null;
          id: number;
          media_type: Database["public"]["Enums"]["media_type"];
          number_of_episodes?: number | null;
          number_of_seasons?: number | null;
          original_title?: string | null;
          overview?: string | null;
          poster_path?: string | null;
          raw?: Json | null;
          release_date?: string | null;
          runtime?: number | null;
          title: string;
          vote_average?: number | null;
          vote_count?: number | null;
        };
        Update: {
          backdrop_path?: string | null;
          external_ids?: Json | null;
          fetched_at?: string;
          genres?: Json | null;
          id?: number;
          media_type?: Database["public"]["Enums"]["media_type"];
          number_of_episodes?: number | null;
          number_of_seasons?: number | null;
          original_title?: string | null;
          overview?: string | null;
          poster_path?: string | null;
          raw?: Json | null;
          release_date?: string | null;
          runtime?: number | null;
          title?: string;
          vote_average?: number | null;
          vote_count?: number | null;
        };
        Relationships: [];
      };
      watch_entries: {
        Row: {
          created_at: string;
          episode_number: number | null;
          finished_at: string | null;
          id: string;
          is_private: boolean;
          media_type: Database["public"]["Enums"]["media_type"];
          rating: number | null;
          season_number: number | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["watch_status"];
          title_id: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          episode_number?: number | null;
          finished_at?: string | null;
          id?: string;
          is_private?: boolean;
          media_type: Database["public"]["Enums"]["media_type"];
          rating?: number | null;
          season_number?: number | null;
          started_at?: string | null;
          status: Database["public"]["Enums"]["watch_status"];
          title_id: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          episode_number?: number | null;
          finished_at?: string | null;
          id?: string;
          is_private?: boolean;
          media_type?: Database["public"]["Enums"]["media_type"];
          rating?: number | null;
          season_number?: number | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["watch_status"];
          title_id?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watch_entries_title_id_media_type_fkey";
            columns: ["title_id", "media_type"];
            isOneToOne: false;
            referencedRelation: "titles";
            referencedColumns: ["id", "media_type"];
          },
          {
            foreignKeyName: "watch_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      media_type: "movie" | "tv";
      watch_status: "want" | "watching" | "watched" | "dropped";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      media_type: ["movie", "tv"],
      watch_status: ["want", "watching", "watched", "dropped"],
    },
  },
} as const;
