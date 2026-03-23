/**
 * Nomes das Edge Functions Deno em supabase/functions (paridade com config.toml).
 * Modo stub: 501 até existir handler Node em src/handlers/<name>.ts (roadmap).
 */
export const EDGE_FUNCTION_NAMES = new Set([
  "meta-whatsapp-webhook",
  "evolution-whatsapp-webhook",
  "telegram-webhook",
  "telegram-set-webhook",
  "send-whatsapp",
  "send-outbound-message",
  "fetch-whatsapp-profile",
  "webhook-dispatcher",
  "meta-oauth-exchange",
  "test-webhook",
  "process-media",
  "upload-media",
  "send-csat-survey",
  "get-widget-config",
  "widget-chat",
  "platform-api",
  "execute-macro",
]);

export function stubResponse(name: string) {
  return {
    error: "not_implemented",
    detail:
      "Modo FUNCTIONS_RUNTIME_MODE=stub — implementar em services/functions-runtime/src/handlers ou usar mode=forward para Supabase.",
    function: name,
  };
}
