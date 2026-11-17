import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ProviderAuthInteraction, ProviderAuthState } from "./providerSetup.ts";

const decodeState = Schema.decodeUnknownSync(ProviderAuthState);

describe("provider auth state", () => {
  it("carries credential field defaults only for non-secret fields", () => {
    const encode = Schema.encodeUnknownSync(ProviderAuthInteraction);
    const publicField = { name: "user_id", label: "User ID", secret: false, initialValue: "user" };
    const secretField = { name: "api_key", label: "API key", secret: true, hasSavedValue: true };
    expect(
      encode({
        type: "credentials",
        id: "change",
        fields: [publicField, { ...secretField, initialValue: "must-not-travel" }],
      }),
    ).toEqual({ type: "credentials", id: "change", fields: [publicField, secretField] });
  });

  it("drops auth variants from newer servers instead of rejecting the state", () => {
    const method = { id: "browser", name: "Browser", description: null, type: "agent" };
    expect(
      decodeState({
        instanceId: "cursor",
        phase: "waiting",
        flowId: null,
        authorizationUrl: null,
        expiresAt: null,
        message: null,
        methods: [method, { ...method, id: "passkey", type: "passkey" }],
        interaction: { type: "passkey", id: "passkey" },
        credentialOwner: "keychain",
      }),
    ).toEqual({
      instanceId: "cursor",
      phase: "waiting",
      flowId: null,
      authorizationUrl: null,
      expiresAt: null,
      message: null,
      methods: [method],
    });
  });
});
