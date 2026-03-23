import { describe, it, expect } from "vitest";
import {
  getFunctionsBaseUrl,
  getFunctionUrl,
  getMediaUploadFunctionsBaseUrl,
  getSupabaseUrl,
  getUploadMediaUrl,
  normalizeFunctionsBaseUrl,
  useExternalMediaStorage,
} from "./runtimeEnv";

describe("runtimeEnv", () => {
  it("getSupabaseUrl usa VITE_SUPABASE_URL do ambiente de teste", () => {
    expect(getSupabaseUrl()).toBe("http://127.0.0.1:54321");
  });

  it("getFunctionsBaseUrl default é {supabase}/functions/v1", () => {
    expect(getFunctionsBaseUrl()).toBe("http://127.0.0.1:54321/functions/v1");
  });

  it("getFunctionUrl concatena o nome da função", () => {
    expect(getFunctionUrl("send-whatsapp")).toBe(
      "http://127.0.0.1:54321/functions/v1/send-whatsapp",
    );
  });

  it("getFunctionUrl remove barra inicial do nome", () => {
    expect(getFunctionUrl("/process-media")).toBe(
      "http://127.0.0.1:54321/functions/v1/process-media",
    );
  });

  it("normalizeFunctionsBaseUrl remove nome de função após functions/v1", () => {
    expect(
      normalizeFunctionsBaseUrl("https://proj.supabase.co/functions/v1/meta-whatsapp-webhook"),
    ).toBe("https://proj.supabase.co/functions/v1");
    expect(normalizeFunctionsBaseUrl("https://proj.supabase.co/functions/v1")).toBe(
      "https://proj.supabase.co/functions/v1",
    );
  });

  it("getMediaUploadFunctionsBaseUrl sem override coincide com getFunctionsBaseUrl", () => {
    expect(getMediaUploadFunctionsBaseUrl()).toBe(getFunctionsBaseUrl());
  });

  it("getUploadMediaUrl aponta para upload-media", () => {
    expect(getUploadMediaUrl()).toBe("http://127.0.0.1:54321/functions/v1/upload-media");
  });

  it("useExternalMediaStorage default false no ambiente de teste", () => {
    expect(useExternalMediaStorage()).toBe(false);
  });
});
