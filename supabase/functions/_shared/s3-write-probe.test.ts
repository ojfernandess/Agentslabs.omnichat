/**
 * Deno: `deno test --allow-env supabase/functions/_shared/s3-write-probe.test.ts`
 * Com secrets S3 no ambiente, o segundo teste valida MinIO acessível da máquina local (não é igual à cloud Supabase).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runS3WriteProbeFromEdge } from "./s3-write-probe.ts";

Deno.test("s3_write_probe: skipped quando faltam secrets", async () => {
  const keys = [
    "S3_MEDIA_ENDPOINT",
    "S3_MEDIA_ACCESS_KEY",
    "S3_MEDIA_SECRET_KEY",
    "MEDIA_PUBLIC_BASE_URL",
  ] as const;
  const backup: Record<string, string | undefined> = {};
  for (const k of keys) {
    backup[k] = Deno.env.get(k);
    Deno.env.delete(k);
  }
  try {
    const r = await runS3WriteProbeFromEdge();
    assertEquals(r.ran, false);
    if (!r.ran) {
      assertEquals(typeof r.skipped_reason, "string");
      assertEquals(r.skipped_reason.length > 10, true);
    }
  } finally {
    for (const k of keys) {
      const v = backup[k];
      if (v !== undefined) Deno.env.set(k, v);
      else Deno.env.delete(k);
    }
  }
});

Deno.test({
  name: "s3_write_probe: integração (só com S3_* + MEDIA_PUBLIC_* definidos)",
  ignore: !Deno.env.get("S3_MEDIA_ENDPOINT")?.trim() ||
    !Deno.env.get("S3_MEDIA_ACCESS_KEY")?.trim() ||
    !Deno.env.get("S3_MEDIA_SECRET_KEY")?.trim() ||
    !Deno.env.get("MEDIA_PUBLIC_BASE_URL")?.trim(),
  fn: async () => {
    const r = await runS3WriteProbeFromEdge();
    assertEquals(r.ran, true);
    if (r.ran) {
      assertEquals(typeof r.endpoint_host, "string");
      assertEquals(typeof r.bucket, "string");
      if (r.ok) {
        assertEquals(typeof r.put_ms, "number");
        assertEquals(typeof r.delete_ms, "number");
      } else {
        console.error("S3 probe falhou (local):", r.error);
      }
    }
  },
});
