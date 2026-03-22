export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      canned_responses: {
        Row: {
          content: string
          created_at: string
          id: string
          organization_id: string
          short_code: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          organization_id: string
          short_code: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
          short_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canned_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_bots: {
        Row: {
          access_token: string
          avatar_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          outgoing_webhook_url: string
          updated_at: string
        }
        Insert: {
          access_token?: string
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          outgoing_webhook_url: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          outgoing_webhook_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_bots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_agent_bots: {
        Row: {
          agent_bot_id: string
          channel_id: string
          created_at: string
          id: string
          settings: Json
        }
        Insert: {
          agent_bot_id: string
          channel_id: string
          created_at?: string
          id?: string
          settings?: Json
        }
        Update: {
          agent_bot_id?: string
          channel_id?: string
          created_at?: string
          id?: string
          settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "channel_agent_bots_agent_bot_id_fkey"
            columns: ["agent_bot_id"]
            isOneToOne: false
            referencedRelation: "agent_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_agent_bots_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          id: string
          channel_id: string
          organization_member_id: string
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          organization_member_id: string
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          organization_member_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_organization_member_id_fkey"
            columns: ["organization_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          auto_assign_enabled: boolean
          channel_type: Database["public"]["Enums"]["channel_type"]
          config: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          public_token: string
          routing_skill_tags: string[]
          updated_at: string
        }
        Insert: {
          auto_assign_enabled?: boolean
          channel_type: Database["public"]["Enums"]["channel_type"]
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          public_token?: string
          routing_skill_tags?: string[]
          updated_at?: string
        }
        Update: {
          auto_assign_enabled?: boolean
          channel_type?: Database["public"]["Enums"]["channel_type"]
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          public_token?: string
          routing_skill_tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          custom_fields: Json | null
          email: string | null
          id: string
          name: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assignee_id: string | null
          channel_id: string | null
          contact_id: string | null
          created_at: string
          custom_attributes: Json | null
          first_reply_at: string | null
          id: string
          last_message_at: string | null
          organization_id: string
          priority: Database["public"]["Enums"]["conversation_priority"]
          resolved_at: string | null
          satisfaction_score: number | null
          sla_first_reply_due_at: string | null
          sla_policy_id: string | null
          sla_resolution_due_at: string | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          tags: string[] | null
          team_id: string | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          custom_attributes?: Json | null
          first_reply_at?: string | null
          id?: string
          last_message_at?: string | null
          organization_id: string
          priority?: Database["public"]["Enums"]["conversation_priority"]
          resolved_at?: string | null
          satisfaction_score?: number | null
          sla_first_reply_due_at?: string | null
          sla_policy_id?: string | null
          sla_resolution_due_at?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          tags?: string[] | null
          team_id?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          custom_attributes?: Json | null
          first_reply_at?: string | null
          id?: string
          last_message_at?: string | null
          organization_id?: string
          priority?: Database["public"]["Enums"]["conversation_priority"]
          resolved_at?: string | null
          satisfaction_score?: number | null
          sla_first_reply_due_at?: string | null
          sla_policy_id?: string | null
          sla_resolution_due_at?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          tags?: string[] | null
          team_id?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string | null
          content_type: string | null
          conversation_id: string
          created_at: string
          id: string
          is_private: boolean | null
          message_type: Database["public"]["Enums"]["message_type"]
          metadata: Json | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          attachments?: Json | null
          content?: string | null
          content_type?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_private?: boolean | null
          message_type?: Database["public"]["Enums"]["message_type"]
          metadata?: Json | null
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          attachments?: Json | null
          content?: string | null
          content_type?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_private?: boolean | null
          message_type?: Database["public"]["Enums"]["message_type"]
          metadata?: Json | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          last_seen_at: string | null
          max_concurrent_chats: number | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          skill_tags: string[]
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen_at?: string | null
          max_concurrent_chats?: number | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          skill_tags?: string[]
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen_at?: string | null
          max_concurrent_chats?: number | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          skill_tags?: string[]
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_webhooks: {
        Row: {
          created_at: string
          custom_headers: Json
          events: string[]
          id: string
          is_active: boolean
          last_delivery_at: string | null
          last_delivery_status: string | null
          name: string
          organization_id: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          custom_headers?: Json
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_delivery_status?: string | null
          name: string
          organization_id: string
          secret?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          custom_headers?: Json
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_delivery_status?: string | null
          name?: string
          organization_id?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json
          notification_type: string
          organization_id: string
          read_at: string | null
          severity: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notification_type: string
          organization_id: string
          read_at?: string | null
          severity?: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notification_type?: string
          organization_id?: string
          read_at?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_delivery_logs: {
        Row: {
          created_at: string
          error_excerpt: string | null
          event_name: string | null
          http_status: number | null
          id: string
          organization_id: string
          outbound_webhook_id: string
          queue_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_excerpt?: string | null
          event_name?: string | null
          http_status?: number | null
          id?: string
          organization_id: string
          outbound_webhook_id: string
          queue_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          error_excerpt?: string | null
          event_name?: string | null
          http_status?: number | null
          id?: string
          organization_id?: string
          outbound_webhook_id?: string
          queue_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_delivery_logs_outbound_webhook_id_fkey"
            columns: ["outbound_webhook_id"]
            isOneToOne: false
            referencedRelation: "outbound_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_outbound_queue: {
        Row: {
          attempts: number
          created_at: string
          delivery_id: string
          event_name: string
          id: string
          last_error: string | null
          last_http_status: number | null
          max_attempts: number
          next_attempt_at: string
          organization_id: string
          outbound_webhook_id: string
          payload: Json
          status: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivery_id: string
          event_name: string
          id?: string
          last_error?: string | null
          last_http_status?: number | null
          max_attempts?: number
          next_attempt_at?: string
          organization_id: string
          outbound_webhook_id: string
          payload: Json
          status?: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivery_id?: string
          event_name?: string
          id?: string
          last_error?: string | null
          last_http_status?: number | null
          max_attempts?: number
          next_attempt_at?: string
          organization_id?: string
          outbound_webhook_id?: string
          payload?: Json
          status?: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_outbound_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_outbound_queue_outbound_webhook_id_fkey"
            columns: ["outbound_webhook_id"]
            isOneToOne: false
            referencedRelation: "outbound_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          plan: string
          settings: Json | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          settings?: Json | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          settings?: Json | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          member_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          created_at: string
          enabled: boolean
          id: string
          name: string
          organization_id: string
          sort_order: number
          trigger: Json
          updated_at: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          trigger?: Json
          updated_at?: string
        }
        Update: {
          actions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          trigger?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json
          channel_id: string | null
          created_at: string
          id: string
          message_body: string
          name: string
          organization_id: string
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          channel_id?: string | null
          created_at?: string
          id?: string
          message_body?: string
          name: string
          organization_id: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          channel_id?: string | null
          created_at?: string
          id?: string
          message_body?: string
          name?: string
          organization_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      captain_settings: {
        Row: {
          api_base_url: string | null
          api_key: string | null
          enabled: boolean
          model: string | null
          organization_id: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          api_base_url?: string | null
          api_key?: string | null
          enabled?: boolean
          model?: string | null
          organization_id: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          api_base_url?: string | null
          api_key?: string | null
          enabled?: boolean
          model?: string | null
          organization_id?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "captain_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_attribute_definitions: {
        Row: {
          attribute_key: string
          created_at: string
          entity_type: string
          id: string
          label: string
          list_options: Json | null
          organization_id: string
          sort_order: number
          updated_at: string
          value_type: string
        }
        Insert: {
          attribute_key: string
          created_at?: string
          entity_type: string
          id?: string
          label: string
          list_options?: Json | null
          organization_id: string
          sort_order?: number
          updated_at?: string
          value_type: string
        }
        Update: {
          attribute_key?: string
          created_at?: string
          entity_type?: string
          id?: string
          label?: string
          list_options?: Json | null
          organization_id?: string
          sort_order?: number
          updated_at?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_attribute_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      help_center_articles: {
        Row: {
          body: string
          category_id: string | null
          created_at: string
          id: string
          organization_id: string
          published: boolean
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          category_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          published?: boolean
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          published?: boolean
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_center_articles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      help_center_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "help_center_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      macros: {
        Row: {
          actions: Json
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "macros_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          organization_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          organization_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          id: string
          organization_id: string
          permission_key: string
          role: Database["public"]["Enums"]["org_role"]
        }
        Insert: {
          allowed?: boolean
          id?: string
          organization_id: string
          permission_key: string
          role: Database["public"]["Enums"]["org_role"]
        }
        Update: {
          allowed?: boolean
          id?: string
          organization_id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["org_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      security_settings: {
        Row: {
          allowed_ip_cidrs: string[]
          organization_id: string
          require_2fa_for_admins: boolean
          session_timeout_minutes: number | null
          updated_at: string
        }
        Insert: {
          allowed_ip_cidrs?: string[]
          organization_id: string
          require_2fa_for_admins?: boolean
          session_timeout_minutes?: number | null
          updated_at?: string
        }
        Update: {
          allowed_ip_cidrs?: string[]
          organization_id?: string
          require_2fa_for_admins?: boolean
          session_timeout_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          channel_id: string | null
          created_at: string
          first_reply_minutes: number
          id: string
          name: string
          organization_id: string
          priority_filter: string | null
          resolution_minutes: number
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          first_reply_minutes: number
          id?: string
          name: string
          organization_id: string
          priority_filter?: string | null
          resolution_minutes: number
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          first_reply_minutes?: number
          id?: string
          name?: string
          organization_id?: string
          priority_filter?: string | null
          resolution_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_settings: {
        Row: {
          notes: string | null
          organization_id: string
          transitions: Json
          updated_at: string
        }
        Insert: {
          notes?: string | null
          organization_id: string
          transitions?: Json
          updated_at?: string
        }
        Update: {
          notes?: string | null
          organization_id?: string
          transitions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization_with_owner: {
        Args: { p_name: string; p_slug: string }
        Returns: Database["public"]["Tables"]["organizations"]["Row"]
      }
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      campaign_status: "draft" | "scheduled" | "sent" | "cancelled"
      channel_type:
        | "whatsapp"
        | "messenger"
        | "instagram"
        | "telegram"
        | "email"
        | "livechat"
        | "sms"
        | "api"
        | "line"
      conversation_priority: "urgent" | "high" | "medium" | "low" | "none"
      conversation_status: "open" | "pending" | "resolved" | "snoozed"
      message_type: "incoming" | "outgoing" | "activity" | "note"
      org_role: "owner" | "admin" | "supervisor" | "agent"
      webhook_delivery_status: "pending" | "delivered" | "dead"
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
    Enums: {
      channel_type: [
        "whatsapp",
        "messenger",
        "instagram",
        "telegram",
        "email",
        "livechat",
        "sms",
        "api",
        "line",
      ],
      conversation_priority: ["urgent", "high", "medium", "low", "none"],
      conversation_status: ["open", "pending", "resolved", "snoozed"],
      message_type: ["incoming", "outgoing", "activity", "note"],
      org_role: ["owner", "admin", "supervisor", "agent"],
      webhook_delivery_status: ["pending", "delivered", "dead"],
    },
  },
} as const
