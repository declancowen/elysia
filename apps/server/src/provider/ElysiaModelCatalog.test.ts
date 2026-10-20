import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ProviderInstanceId } from "@elysiatools/contracts";
import { resolveClaudeCatalogContextWindowTokens } from "./ClaudeModelCatalog.ts";
import {
  ELYSIA_MODELS,
  ElysiaModelMetadata,
  elysiaModelCatalog,
  elysiaModelEnvironment,
} from "./ElysiaModelCatalog.ts";

const metadata = {
  "gpt-6.1-sol": { contextWindowTokens: 272000, autoCompactWindowTokens: 230000 },
  "claude-haiku-5-5": { contextWindowTokens: 1000000, autoCompactWindowTokens: 850000 },
};

describe("native Elysia model routing", () => {
  it("offers the supplied CLI roster while preserving older CLI choices", () => {
    expect(ELYSIA_MODELS).toEqual(
      expect.arrayContaining(["claude-sonnet-5-5", "claude-haiku-5-5", "gpt-6.1-sol"]),
    );
    for (const retired of [
      "claude-sonnet-5",
      "claude-haiku-4-5",
      "xai.grok-4.6",
      "mistral-large-3",
    ])
      expect(ELYSIA_MODELS).not.toContain(retired);
    expect(
      elysiaModelCatalog(["claude-sonnet-5"], "claude-sonnet-5").models[0]?.model,
    ).toMatchObject({ slug: "claude-sonnet-5", name: "Claude Sonnet 5", isDefault: true });
  });

  it("uses the selected model's native limits without changing credentials, TLS or global defaults", () => {
    const catalog = elysiaModelCatalog(Object.keys(metadata), "claude-haiku-5-5", metadata);
    const selection = { instanceId: ProviderInstanceId.make("elysia"), model: "gpt-6.1-sol" };
    expect(resolveClaudeCatalogContextWindowTokens(catalog, selection)).toBe(272000);
    const original = {
      ANTHROPIC_MODEL: "claude-haiku-5-5",
      ANTHROPIC_AUTH_TOKEN: "fixture-secret",
      ANTHROPIC_CUSTOM_HEADERS: "x-portkey-beta:use-responses-api-2026-07-30",
      NODE_EXTRA_CA_CERTS: "/native/company-ca.pem",
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: "1000000",
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: "850000",
      CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "1",
    };
    expect(elysiaModelEnvironment(original, selection.model, catalog)).toMatchObject({
      ...original,
      ELYSIA_ACTIVE_MODEL: selection.model,
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: "272000",
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: "230000",
      ANTHROPIC_CUSTOM_MODEL_OPTION: selection.model,
    });
    expect(original.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe("1000000");
    expect(
      catalog.models[0]?.model.capabilities?.optionDescriptors?.map((option) => option.id),
    ).toEqual(["effort"]);
  });

  it("leaves absent limits unset for older CLIs and preserves their configured environment", () => {
    const catalog = elysiaModelCatalog(["gpt-5-4"]);
    expect(
      resolveClaudeCatalogContextWindowTokens(catalog, {
        instanceId: ProviderInstanceId.make("elysia"),
        model: "gpt-5-4",
      }),
    ).toBeUndefined();
    const environment = elysiaModelEnvironment({}, "gpt-5-4", catalog);
    expect(environment.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBeUndefined();
    expect(environment.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBeUndefined();
    expect(
      elysiaModelEnvironment({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: "123456" }, "gpt-5-4", catalog)
        .CLAUDE_CODE_AUTO_COMPACT_WINDOW,
    ).toBe("123456");
  });

  it("rejects invalid native token metadata", () => {
    const decode = Schema.decodeUnknownOption(ElysiaModelMetadata);
    expect(decode(metadata)._tag).toBe("Some");
    for (const values of [
      { contextWindowTokens: 0, autoCompactWindowTokens: 1 },
      { contextWindowTokens: 10, autoCompactWindowTokens: 11 },
      { contextWindowTokens: 10, autoCompactWindowTokens: 10 },
      { contextWindowTokens: 10, autoCompactWindowTokens: "9" },
    ])
      expect(decode({ "fixture-model": values })._tag).toBe("None");
  });

  it("validates optional native prices and tier boundaries without rejecting legacy metadata", () => {
    const decode = Schema.decodeUnknownOption(ElysiaModelMetadata);
    const limits = { contextWindowTokens: 200000, autoCompactWindowTokens: 150000 };
    const pricing = { inputCostPerMillionTokens: 0, outputCostPerMillionTokens: 2.5 };
    expect(decode({ fixture: { ...limits, pricing } })._tag).toBe("Some");
    expect(decode({ fixture: limits })._tag).toBe("Some");
    expect(
      decode({
        fixture: {
          ...limits,
          pricing: { ...pricing, longContext: { ...pricing, aboveInputTokens: 128000 } },
        },
      })._tag,
    ).toBe("Some");
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, "1.5"])
      expect(
        decode({
          fixture: {
            ...limits,
            pricing: { ...pricing, inputCostPerMillionTokens: invalid },
          },
        })._tag,
      ).toBe("None");
    for (const aboveInputTokens of [0, -1, 1.5])
      expect(
        decode({
          fixture: {
            ...limits,
            pricing: { ...pricing, longContext: { ...pricing, aboveInputTokens } },
          },
        })._tag,
      ).toBe("None");
  });
});
