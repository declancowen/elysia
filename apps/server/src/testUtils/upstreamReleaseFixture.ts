import { vi } from "vite-plus/test";

// Retained upstream compatibility fixtures target the upstream release range,
// independently of Elysia's own release numbering.
vi.mock("../../package.json", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import("../../package.json") }>();
  return { ...actual, default: { ...actual.default, version: "0.0.44" } };
});
