import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isAllowedMessageMimeType,
  maxBytesForMessageMime,
  validateMessageFileMagic,
} from "./media-upload-policy.ts";

Deno.test("strict — imagem 10MB cap", () => {
  assertEquals(maxBytesForMessageMime("image/jpeg", false), 10 * 1024 * 1024);
  assertEquals(maxBytesForMessageMime("video/mp4", false), 500 * 1024 * 1024);
  assertEquals(maxBytesForMessageMime("audio/mpeg", false), 50 * 1024 * 1024);
});

Deno.test("strict — gif não permitido", () => {
  assertEquals(isAllowedMessageMimeType("image/gif", false), false);
});

Deno.test("legacy — gif permitido", () => {
  assertEquals(isAllowedMessageMimeType("image/gif", true), true);
});

Deno.test("magic — jpeg", () => {
  const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  assertEquals(validateMessageFileMagic("image/jpeg", buf, false), null);
});

Deno.test("magic — png mismatch", () => {
  const buf = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]);
  assertEquals(validateMessageFileMagic("image/png", buf, false)?.includes("PNG"), true);
});
