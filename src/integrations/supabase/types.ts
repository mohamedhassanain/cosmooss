export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          image_url: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          image_url?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          image_url?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          id: string
          category_id: string
          name: string
          slug: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          name: string
          slug?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          name?: string
          slug?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          ingredients: string | null
          how_to_use: string | null
          price: number
          original_price: number | null
          is_promotion: boolean
          is_featured: boolean
          is_active: boolean
          image_url: string | null
          image_url_400: string | null
          image_url_800: string | null
          category_id: string | null
          subcategory_id: string | null
          stock_quantity: number
          weight_grams: number | null
          brand: string | null
          video_url: string | null
          location_city: string | null
          location_url: string | null
          show_location: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          ingredients?: string | null
          how_to_use?: string | null
          price: number
          original_price?: number | null
          is_promotion?: boolean
          is_featured?: boolean
          is_active?: boolean
          image_url?: string | null
          image_url_400?: string | null
          image_url_800?: string | null
          category_id?: string | null
          subcategory_id?: string | null
          stock_quantity?: number
          weight_grams?: number | null
          brand?: string | null
          video_url?: string | null
          location_city?: string | null
          location_url?: string | null
          show_location?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          ingredients?: string | null
          how_to_use?: string | null
          price?: number
          original_price?: number | null
          is_promotion?: boolean
          is_featured?: boolean
          is_active?: boolean
          image_url?: string | null
          image_url_400?: string | null
          image_url_800?: string | null
          category_id?: string | null
          subcategory_id?: string | null
          stock_quantity?: number
          weight_grams?: number | null
          brand?: string | null
          video_url?: string | null
          location_city?: string | null
          location_url?: string | null
          show_location?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          id: string
          customer_name: string
          customer_phone: string
          customer_city: string | null
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          status: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          customer_name: string
          customer_phone: string
          customer_city?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          total_price: number
          status?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          customer_name?: string
          customer_phone?: string
          customer_city?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          status?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          id: string
          name: string
          email: string
          phone: string | null
          subject: string | null
          message: string
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone?: string | null
          subject?: string | null
          message: string
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string | null
          subject?: string | null
          message?: string
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          site_name: string
          site_description: string | null
          whatsapp_number: string
          phone_number: string | null
          email: string | null
          address: string | null
          logo_url: string | null
          hero_title: string | null
          hero_subtitle: string | null
          free_shipping_min: number | null
          promo_enabled: boolean
          promo_badge: string | null
          promo_title: string | null
          promo_subtitle: string | null
          promo_link: string | null
          promo_image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          site_name?: string
          site_description?: string | null
          whatsapp_number?: string
          phone_number?: string | null
          email?: string | null
          address?: string | null
          logo_url?: string | null
          hero_title?: string | null
          hero_subtitle?: string | null
          free_shipping_min?: number | null
          promo_enabled?: boolean
          promo_badge?: string | null
          promo_title?: string | null
          promo_subtitle?: string | null
          promo_link?: string | null
          promo_image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          site_name?: string
          site_description?: string | null
          whatsapp_number?: string
          phone_number?: string | null
          email?: string | null
          address?: string | null
          logo_url?: string | null
          hero_title?: string | null
          hero_subtitle?: string | null
          free_shipping_min?: number | null
          promo_enabled?: boolean
          promo_badge?: string | null
          promo_title?: string | null
          promo_subtitle?: string | null
          promo_link?: string | null
          promo_image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      promos: {
        Row: {
          id: string
          badge: string | null
          title: string
          subtitle: string | null
          link: string
          image_url: string | null
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          badge?: string | null
          title: string
          subtitle?: string | null
          link?: string
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          badge?: string | null
          title?: string
          subtitle?: string | null
          link?: string
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof Database
}
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
