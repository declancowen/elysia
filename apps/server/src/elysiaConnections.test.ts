import { expect, it } from "vite-plus/test";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
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
  } finally {
    await dispose();
  }
});
