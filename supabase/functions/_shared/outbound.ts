import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** Enfileira entregas para cada outbound_webhook ativo que assina o evento */
export async function enqueueOutboundForEvent(
  supabase: SupabaseClient,
  organizationId: string,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: hooks, error } = await supabase
    .from("outbound_webhooks")
    .select("id, organization_id, events")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    console.error("enqueueOutboundForEvent list error", error);
    return;
  }

  const matched = (hooks ?? []).filter((h) => {
    const evts = h.events as string[] | null;
    if (!evts?.length) return false;
    return evts.includes("*") || evts.includes(eventName);
  });
  if (!matched.length) return;

  const deliveryRows = matched.map((h) => ({
    organization_id: organizationId,
    outbound_webhook_id: h.id,
    event_name: eventName,
    payload,
    delivery_id: crypto.randomUUID(),
    status: "pending" as const,
    next_attempt_at: new Date().toISOString(),
  }));

  const { error: insErr } = await supabase.from("webhook_outbound_queue").insert(deliveryRows);
  if (insErr) console.error("enqueueOutboundForEvent insert error", insErr);
}

export async function triggerDispatcherBestEffort(): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");
  if (!base || !secret) return;
  const url = `${base}/functions/v1/webhook-dispatcher`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batch_size: 30 }),
    });
  } catch (e) {
    console.error("triggerDispatcherBestEffort", e);
  }
}
