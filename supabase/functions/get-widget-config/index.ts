/**
 * API pública para o widget de Live Chat obter a configuração da caixa.
 * Retorna position, balloon_type, cores e textos para o embed.
 *
 * Uso: GET /functions/v1/get-widget-config?token={public_token}
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Parâmetro token é obrigatório" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Configuração do servidor incompleta" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: channel, error } = await supabase
    .from("channels")
    .select("id, name, channel_type, config, is_active")
    .eq("public_token", token)
    .eq("channel_type", "livechat")
    .maybeSingle();

  if (error) {
    console.error("get-widget-config db error:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao obter configuração" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  if (!channel || !channel.is_active) {
    return new Response(
      JSON.stringify({ error: "Caixa não encontrada ou inativa" }),
      { status: 404, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const config = (channel.config ?? {}) as Record<string, unknown>;
  const widget = (config.widget ?? {}) as Record<string, unknown>;

  function normalizePrechat(pc: unknown): Record<string, unknown> | null {
    if (!pc || typeof pc !== "object") return null;
    const p = pc as Record<string, unknown>;
    const enabled = !!p.enabled;
    const fieldsRaw = (p.fields ?? []) as Record<string, unknown>[];
    const fields = Array.isArray(fieldsRaw)
      ? fieldsRaw.map((f) => ({
          key: String(f.key ?? ""),
          type: ["email", "number"].includes(String(f.type ?? "")) ? f.type : "text",
          required: !!f.required,
          label: String(f.label ?? f.key ?? ""),
          placeholder: String(f.placeholder ?? ""),
          enabled: f.enabled !== false,
        }))
      : [];
    return { enabled, message: String(p.message ?? ""), fields };
  }

  const pos = (widget.position as string) || "right";
  const position = pos === "left" || pos === "bottom-left" ? "left" : "right";
  const type =
    (widget.type as string) === "expanded_bubble"
      ? "expanded_bubble"
      : "standard";

  const body = {
    channel_id: channel.id,
    position,
    type,
    widget_color: (widget.widget_color as string) || (widget.primary_color as string) || "#7C3AED",
    primary_color: (widget.widget_color as string) || (widget.primary_color as string) || "#7C3AED",
    site_name: (widget.site_name as string) || channel.name || "",
    welcome_title:
      (widget.welcome_title as string) || (widget.welcome_headline as string) || "Olá, tudo bem?",
    welcome_description:
      (widget.welcome_description as string) ||
      (widget.welcome_message as string) ||
      (config.welcome_message as string) ||
      "Sou o assistente virtual e posso ajudar. Como posso ajudar?",
    launcher_title:
      (widget.launcher_title as string) || (widget.launcherTitle as string) || "Fale conosco no chat",
    launcherTitle:
      (widget.launcher_title as string) || (widget.launcherTitle as string) || "Fale conosco no chat",
    avatar_url: (widget.avatar_url as string) || "",
    available_message:
      (widget.available_message as string) || (widget.availableMessage as string) || "Estamos On-line",
    unavailable_message:
      (widget.unavailable_message as string) ||
      (widget.unavailableMessage as string) ||
      "Estamos offline. Deixe uma mensagem.",
    response_time: (widget.response_time as string) || "few_minutes",
    prechat: normalizePrechat(widget.prechat),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
