export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      credit_pack_purchases: {
        Row: {
          created_at: string
          credits_purchased: number
          id: string
          pack_id: string
          purchase_completed_at: string | null
          starts_at: string
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_purchased?: number
          id?: string
          pack_id: string
          purchase_completed_at?: string | null
          starts_at?: string
          status: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_purchased?: number
          id?: string
          pack_id?: string
          purchase_completed_at?: string | null
          starts_at?: string
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_pack_purchases_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "credit_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packs: {
        Row: {
          created_at: string
          credits_included: number
          description: string | null
          display_order: number | null
          features: string[] | null
          id: string
          is_active: boolean
          name: string
          popular: boolean | null
          price_cents: number
          savings_percentage: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_included: number
          description?: string | null
          display_order?: number | null
          features?: string[] | null
          id?: string
          is_active?: boolean
          name: string
          popular?: boolean | null
          price_cents: number
          savings_percentage?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_included?: number
          description?: string | null
          display_order?: number | null
          features?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          popular?: boolean | null
          price_cents?: number
          savings_percentage?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          appearance_preference: string | null
          avatar_url: string | null
          created_at: string
          credits: number
          full_name: string | null
          id: string
          language_preference: string | null
          response_language_preference: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          appearance_preference?: string | null
          avatar_url?: string | null
          created_at?: string
          credits?: number
          full_name?: string | null
          id?: string
          language_preference?: string | null
          response_language_preference?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          appearance_preference?: string | null
          avatar_url?: string | null
          created_at?: string
          credits?: number
          full_name?: string | null
          id?: string
          language_preference?: string | null
          response_language_preference?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      summaries: {
        Row: {
          created_at: string
          duration: number | null
          id: string
          key_points: string[] | null
          summary: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          video_description: string | null
          video_title: string | null
          youtube_url: string
        }
        Insert: {
          created_at?: string
          duration?: number | null
          id?: string
          key_points?: string[] | null
          summary: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          video_description?: string | null
          video_title?: string | null
          youtube_url: string
        }
        Update: {
          created_at?: string
          duration?: number | null
          id?: string
          key_points?: string[] | null
          summary?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          video_description?: string | null
          video_title?: string | null
          youtube_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_user_credits: {
        Args: {
          user_id_param: string
          credit_amount: number
          transaction_type_param: string
          description_param?: string
          reference_id_param?: string
        }
        Returns: boolean
      }
      deduct_user_credits: {
        Args: {
          user_id_param: string
          credit_amount: number
          description_param?: string
          reference_id_param?: string
        }
        Returns: boolean
      }
      purchase_credit_pack: {
        Args: {
          user_id_param: string
          pack_id_param: string
          stripe_payment_intent_id_param: string
        }
        Returns: string
      }
      refund_user_credits: {
        Args: {
          user_id_param: string
          credit_amount: number
          description_param?: string
          reference_id_param?: string
        }
        Returns: boolean
      }
      update_user_credits: {
        Args:
          | {
              user_id_param: string
              credit_amount: number
              transaction_type_param: string
              description_param?: string
              reference_id_param?: string
            }
          | {
              user_id_param: string
              credit_amount: number
              transaction_type_param: string
              description_param?: string
              reference_id_param?: string
            }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
