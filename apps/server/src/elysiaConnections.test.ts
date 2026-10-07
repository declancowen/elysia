import { expect, it } from "vite-plus/test";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { elysiaConnectionsPolicyLayer } from "./http.ts";

it("rejects connection endpoints before their handlers while preserving local app authentication", async () => {
  const { handler, dispose } = HttpRouter.toWebHandler(
    Layer.mergeAll(
      HttpRouter.add("*", "*", HttpServerResponse.text("allowed")),
      elysiaConnectionsPolicyLayer,
    ),
    { disableLogger: true },
  );
  try {
    for (const pathname of [
      "/api/connect/link-proof",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-authorization-server",
      "/oauth/mcp/register",
      "/oauth/mcp/authorize",
      "/oauth/mcp/approval",
      "/oauth/mcp/decision",
      "/oauth/mcp/token",
      "/api/t3-connect/health",
      "/api/t3-connect/mint-credential",
      "/api/auth/pairing-token",
      "/api/auth/clients",
      "/api/auth/clients/client-id",
    ]) {
      const response = await handler(
        new Request(`http://localhost${pathname}`, { method: "POST" }),
      );
      expect(response.status).toBe(403);
      expect(await response.text()).toContain("Connections are disabled in Elysia");
    }
    expect((await handler(new Request("http://localhost/api/auth/browser-session"))).status).toBe(
      200,
    );
    expect((await handler(new Request("http://localhost/oauth/token"))).status).toBe(200);
  } finally {
    await dispose();
  }
});
