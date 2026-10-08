import type { APIRoute } from "astro";

import { buildElysiaProjectFileJsonSchema } from "@elysiatools/shared/elysiaProjectFile";

// Rendered at build time; published at /schema/elysia.json so
// elysia.json files can reference it via "$schema" for editor/LSP support.
export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(buildElysiaProjectFileJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
