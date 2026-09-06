export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string;
          id: string;
          is_private: boolean;
          kind: string;
          media_type: Database["public"]["Enums"]["media_type"];
          payload: Json | null;
          title_id: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_private?: boolean;
          kind: string;
          media_type: Database["public"]["Enums"]["media_type"];
          payload?: Json | null;
          title_id: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_private?: boolean;
          kind?: string;
          media_type?: Database["public"]["Enums"]["media_type"];
          payload?: Json | null;
          title_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      cinema_films: {
        Row: {
          backdrop_path: string | null;
          fetched_at: string;
          imdb_id: string | null;
          movieglu_film_id: number | null;
          poster_path: string | null;
          title: string | null;
          tmdb_id: number;
        };
        Insert: {
          backdrop_path?: string | null;
          fetched_at?: string;
          imdb_id?: string | null;
          movieglu_film_id?: number | null;
          poster_path?: string | null;
          title?: string | null;
          tmdb_id: number;
        };
        Update: {
          backdrop_path?: string | null;
          fetched_at?: string;
          imdb_id?: string | null;
          movieglu_film_id?: number | null;
          poster_path?: string | null;
          title?: string | null;
          tmdb_id?: number;
        };
        Relationships: [];
      };
      cinema_links: {
        Row: {
          cinema_id: number;
          fetched_at: string;
          source: string;
          url: string | null;
        };
        Insert: {
          cinema_id: number;
          fetched_at?: string;
          source: string;
          url?: string | null;
        };
        Update: {
          cinema_id?: number;
          fetched_at?: string;
          source?: string;
          url?: string | null;
        };
        Relationships: [];
      };
      cinema_plans: {
        Row: {
          backdrop_path: string | null;
          booking_url: string;
          cinema_address: string;
          cinema_id: number;
          cinema_lat: number | null;
          cinema_lng: number | null;
          cinema_name: string;
          created_at: string;
          film_title: string;
          format: string | null;
          id: string;
          poster_path: string | null;
          starts_at: string;
          tmdb_id: number;
          user_id: string;
        };
        Insert: {
          backdrop_path?: string | null;
          booking_url: string;
          cinema_address: string;
          cinema_id: number;
          cinema_lat?: number | null;
          cinema_lng?: number | null;
          cinema_name: string;
          created_at?: string;
          film_title: string;
          format?: string | null;
          id?: string;
          poster_path?: string | null;
          starts_at: string;
          tmdb_id: number;
          user_id: string;
        };
        Update: {
          backdrop_path?: string | null;
          booking_url?: string;
          cinema_address?: string;
          cinema_id?: number;
          cinema_lat?: number | null;
          cinema_lng?: number | null;
          cinema_name?: string;
          created_at?: string;
          film_title?: string;
          format?: string | null;
          id?: string;
          poster_path?: string | null;
          starts_at?: string;
          tmdb_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cinema_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cinema_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
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
          {
            foreignKeyName: "episode_watches_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      friendships: {
        Row: {
          addressee_id: string;
          created_at: string;
          id: string;
          requester_id: string;
          status: Database["public"]["Enums"]["friendship_status"];
          updated_at: string;
        };
        Insert: {
          addressee_id: string;
          created_at?: string;
          id?: string;
          requester_id: string;
          status?: Database["public"]["Enums"]["friendship_status"];
          updated_at?: string;
        };
        Update: {
          addressee_id?: string;
          created_at?: string;
          id?: string;
          requester_id?: string;
          status?: Database["public"]["Enums"]["friendship_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey";
            columns: ["addressee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey";
            columns: ["addressee_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friendships_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friendships_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      imports: {
        Row: {
          created_at: string;
          id: string;
          matched: number;
          rows: number;
          source: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          matched: number;
          rows: number;
          source: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          matched?: number;
          rows?: number;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "imports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "imports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          payload: Json | null;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          payload?: Json | null;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: Json | null;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
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
      recommendations: {
        Row: {
          created_at: string;
          from_user: string;
          id: string;
          media_type: Database["public"]["Enums"]["media_type"];
          message: string | null;
          seen_at: string | null;
          title_id: number;
          to_user: string;
        };
        Insert: {
          created_at?: string;
          from_user: string;
          id?: string;
          media_type: Database["public"]["Enums"]["media_type"];
          message?: string | null;
          seen_at?: string | null;
          title_id: number;
          to_user: string;
        };
        Update: {
          created_at?: string;
          from_user?: string;
          id?: string;
          media_type?: Database["public"]["Enums"]["media_type"];
          message?: string | null;
          seen_at?: string | null;
          title_id?: number;
          to_user?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recommendations_from_user_fkey";
            columns: ["from_user"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendations_from_user_fkey";
            columns: ["from_user"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendations_title_id_media_type_fkey";
            columns: ["title_id", "media_type"];
            isOneToOne: false;
            referencedRelation: "titles";
            referencedColumns: ["id", "media_type"];
          },
          {
            foreignKeyName: "recommendations_to_user_fkey";
            columns: ["to_user"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendations_to_user_fkey";
            columns: ["to_user"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          reason: string | null;
          reporter_id: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          reason?: string | null;
          reporter_id: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          reason?: string | null;
          reporter_id?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      review_comments: {
        Row: {
          body: string;
          created_at: string;
          has_spoilers: boolean;
          id: string;
          parent_id: string | null;
          review_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          has_spoilers?: boolean;
          id?: string;
          parent_id?: string | null;
          review_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          has_spoilers?: boolean;
          id?: string;
          parent_id?: string | null;
          review_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "review_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_comments_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_comments_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "reviews_with_counts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      review_likes: {
        Row: {
          created_at: string;
          review_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          review_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          review_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_likes_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_likes_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "reviews_with_counts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          body: string;
          created_at: string;
          has_spoilers: boolean;
          id: string;
          media_type: Database["public"]["Enums"]["media_type"];
          title_id: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          has_spoilers?: boolean;
          id?: string;
          media_type: Database["public"]["Enums"]["media_type"];
          title_id: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          has_spoilers?: boolean;
          id?: string;
          media_type?: Database["public"]["Enums"]["media_type"];
          title_id?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_title_id_media_type_fkey";
            columns: ["title_id", "media_type"];
            isOneToOne: false;
            referencedRelation: "titles";
            referencedColumns: ["id", "media_type"];
          },
          {
            foreignKeyName: "reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
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
      title_trailers: {
        Row: {
          checked_at: string;
          keys: string[];
          media_type: Database["public"]["Enums"]["media_type"];
          season_number: number;
          source: string;
          title_id: number;
          trailers: Json;
        };
        Insert: {
          checked_at?: string;
          keys?: string[];
          media_type: Database["public"]["Enums"]["media_type"];
          season_number?: number;
          source?: string;
          title_id: number;
          trailers?: Json;
        };
        Update: {
          checked_at?: string;
          keys?: string[];
          media_type?: Database["public"]["Enums"]["media_type"];
          season_number?: number;
          source?: string;
          title_id?: number;
          trailers?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "title_trailers_title_id_media_type_fkey";
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
          seasons: Json | null;
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
          seasons?: Json | null;
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
          seasons?: Json | null;
          title?: string;
          vote_average?: number | null;
          vote_count?: number | null;
        };
        Relationships: [];
      };
      user_locations: {
        Row: {
          label: string;
          lat: number;
          lng: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          label: string;
          lat: number;
          lng: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          label?: string;
          lat?: number;
          lng?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_locations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_locations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
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
          {
            foreignKeyName: "watch_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      reviews_with_counts: {
        Row: {
          body: string | null;
          comment_count: number | null;
          created_at: string | null;
          has_spoilers: boolean | null;
          id: string | null;
          like_count: number | null;
          media_type: Database["public"]["Enums"]["media_type"] | null;
          report_count: number | null;
          title_id: number | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          comment_count?: never;
          created_at?: string | null;
          has_spoilers?: boolean | null;
          id?: string | null;
          like_count?: never;
          media_type?: Database["public"]["Enums"]["media_type"] | null;
          report_count?: never;
          title_id?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          comment_count?: never;
          created_at?: string | null;
          has_spoilers?: boolean | null;
          id?: string | null;
          like_count?: never;
          media_type?: Database["public"]["Enums"]["media_type"] | null;
          report_count?: never;
          title_id?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_title_id_media_type_fkey";
            columns: ["title_id", "media_type"];
            isOneToOne: false;
            referencedRelation: "titles";
            referencedColumns: ["id", "media_type"];
          },
          {
            foreignKeyName: "reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_search";
            referencedColumns: ["id"];
          },
        ];
      };
      user_search: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          id: string | null;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          display_name?: string | null;
          id?: string | null;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          display_name?: string | null;
          id?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      are_friends: { Args: { a: string; b: string }; Returns: boolean };
      import_watch_entries: { Args: { entries: Json }; Returns: number };
      is_blocked: { Args: { a: string; b: string }; Returns: boolean };
      profile_stats: { Args: { uid: string }; Returns: Json };
      report_count: { Args: { t_id: string; t_type: string }; Returns: number };
      title_rating_stats: {
        Args: {
          t_id: number;
          t_type: Database["public"]["Enums"]["media_type"];
        };
        Returns: {
          avg_rating: number;
          rating_count: number;
        }[];
      };
    };
    Enums: {
      friendship_status: "pending" | "accepted" | "blocked";
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
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
      friendship_status: ["pending", "accepted", "blocked"],
      media_type: ["movie", "tv"],
      watch_status: ["want", "watching", "watched", "dropped"],
    },
  },
} as const;
