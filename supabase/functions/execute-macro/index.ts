/**
 * Execute a macro on a conversation.
 * Applies actions: assign_agent, assign_team, add_label, remove_label,
 * send_message, set_status, snooze, send_transcript, mute.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Action = { type: string; [k: string]: unknown };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const supabase = getServiceClient();

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { conversation_id?: string; macro_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { conversation_id, macro_id } = body;
  if (!conversation_id || !macro_id) {
    return new Response(JSON.stringify({ error: "conversation_id e macro_id são obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: convo, error: convoErr } = await supabase
    .from("conversations")
    .select("id, organization_id, channel_id, contact_id, tags, assignee_id, team_id, status, snoozed_until")
    .eq("id", conversation_id)
    .maybeSingle();

  if (convoErr || !convo) {
    return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", convo.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return new Response(JSON.stringify({ error: "Sem acesso a esta organização" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: macro, error: macroErr } = await supabase
    .from("macros")
    .select("id, name, actions, visibility, created_by")
    .eq("id", macro_id)
    .eq("organization_id", convo.organization_id)
    .maybeSingle();

  if (macroErr || !macro) {
    return new Response(JSON.stringify({ error: "Macro não encontrada" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (macro.visibility === "private" && macro.created_by !== user.id) {
    return new Response(JSON.stringify({ error: "Macro privada — sem acesso" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const actions = Array.isArray(macro.actions) ? (macro.actions as Action[]) : [];
  if (actions.length === 0) {
    return new Response(JSON.stringify({ ok: true, applied: 0 }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");

  for (const act of actions) {
    switch (act.type) {
      case "assign_agent": {
        const assigneeId = act.assignee_id as string | undefined;
        if (assigneeId) {
          await supabase.from("conversations").update({ assignee_id: assigneeId }).eq("id", conversation_id);
        }
        break;
      }
      case "assign_team": {
        const teamId = act.team_id as string | undefined;
        if (teamId) {
          await supabase.from("conversations").update({ team_id: teamId }).eq("id", conversation_id);
        }
        break;
      }
      case "add_label": {
        const label = act.label_name as string | undefined;
        if (label) {
          const tags = (convo.tags ?? []) as string[];
          if (!tags.includes(label)) {
            const next = [...tags, label];
            await supabase.from("conversations").update({ tags: next }).eq("id", conversation_id);
            (convo as { tags?: string[] }).tags = next;
          }
        }
        break;
      }
      case "remove_label": {
        const label = act.label_name as string | undefined;
        if (label) {
          const tags = ((convo.tags ?? []) as string[]).filter((t) => t !== label);
          await supabase.from("conversations").update({ tags }).eq("id", conversation_id);
          (convo as { tags?: string[] }).tags = tags;
        }
        break;
      }
      case "set_status": {
        const status = act.status as string | undefined;
        if (status && ["open", "pending", "resolved", "snoozed"].includes(status)) {
          const patch: Record<string, unknown> = { status };
          if (status === "resolved") patch.resolved_at = new Date().toISOString();
          if (status !== "snoozed") patch.snoozed_until = null;
          await supabase.from("conversations").update(patch).eq("id", conversation_id);
        }
        break;
      }
      case "snooze": {
        const until = act.snooze_until as string | undefined;
        if (until) {
          await supabase
            .from("conversations")
            .update({ status: "snoozed", snoozed_until: until })
            .eq("id", conversation_id);
        }
        break;
      }
      case "send_message": {
        const msg = act.message as string | undefined;
        if (msg && msg.trim()) {
          await supabase.from("messages").insert({
            conversation_id,
            sender_type: "agent",
            sender_id: member.id,
            message_type: "outgoing",
            content: msg.trim(),
          });
          await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);
          if (baseUrl && secret) {
            await fetch(`${baseUrl}/functions/v1/send-outbound-message`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secret}`,
              },
              body: JSON.stringify({
                conversation_id,
                content: msg.trim(),
              }),
            });
          }
        }
        break;
      }
      case "mute":
        // Stub: could set custom_attributes.muted = true
        break;
      case "send_transcript":
        // Stub: could trigger email with transcript
        break;
      default:
        break;
    }
  }

  return new Response(JSON.stringify({ ok: true, applied: actions.length }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
