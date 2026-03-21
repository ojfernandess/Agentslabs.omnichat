import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';

export async function logAudit(
  supabase: SupabaseClient<Database>,
  params: {
    organizationId: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from('organization_audit_logs').insert({
    organization_id: params.organizationId,
    actor_user_id: user?.id ?? null,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    metadata: (params.metadata ?? {}) as Json,
  });
}
