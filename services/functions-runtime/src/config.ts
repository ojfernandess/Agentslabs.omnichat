/**
 * FUNCTIONS_RUNTIME_MODE:
 * - forward: encaminha /functions/v1/* para FUNCTIONS_FORWARD_ORIGIN (Supabase Cloud ou outro host Deno)
 * - stub: respostas 501 até implementação Node (desenvolvimento / testes)
 */
export type FunctionsRuntimeMode = "forward" | "stub";

export function getConfig() {
  const port = Number(process.env.FUNCTIONS_PORT ?? process.env.PORT ?? 3100);
  const host = process.env.FUNCTIONS_HOST ?? "0.0.0.0";
  const mode = (process.env.FUNCTIONS_RUNTIME_MODE ?? "forward") as FunctionsRuntimeMode;

  /** Origem HTTPS do projeto Supabase, ex.: https://xxxx.supabase.co (sem barra final) */
  const forwardOrigin = (process.env.FUNCTIONS_FORWARD_ORIGIN ?? "").replace(/\/$/, "");

  const redisUrl = process.env.REDIS_URL ?? "redis://redis:6379";

  if (mode === "forward" && !forwardOrigin) {
    throw new Error(
      "FUNCTIONS_RUNTIME_MODE=forward requer FUNCTIONS_FORWARD_ORIGIN (ex.: https://xxxx.supabase.co)",
    );
  }

  return { port, host, mode, forwardOrigin, redisUrl };
}
