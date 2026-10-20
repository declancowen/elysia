import * as Schema from "effect/Schema";
import type { ModelCapabilities } from "@elysiatools/contracts";
import { BUNDLED_CLAUDE_MODEL_CATALOG, type ClaudeModelCatalog } from "./ClaudeModelCatalog.ts";

// Gateway IDs from the supplied Elysia 0.3.10 package; native settings take
// precedence after setup/update. Keep IDs opaque when dispatching to Claude.
export const ELYSIA_MODELS = [
  "kimi-k2.7-code",
  "kimi-k3",
  "zai.glm-5.3",
  "gpt-5.6-luna",
  "gpt-5.3-codex",
  "gpt-5-4",
  "gpt-5-4-mini",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "deepseek-v4",
  "deepseek-v4.1-flash",
  "minimax-m2.5",
  "gpt-6.1-sol",
];

const GPT_EFFORT_MODELS = new Set([
  "gpt-5.6-luna",
  "gpt-5.3-codex",
  "gpt-5-4",
  "gpt-5-4-mini",
  "gpt-6.1-sol",
]);

const NativeTokenCount = Schema.Int.check(Schema.isGreaterThan(0));
const NativeModelCost = Schema.Number.check(
  Schema.isFinite(),
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
const ElysiaNativeModelPricing = Schema.Struct({
  inputCostPerMillionTokens: NativeModelCost,
  outputCostPerMillionTokens: NativeModelCost,
  longContext: Schema.optionalKey(
    Schema.Struct({
      aboveInputTokens: NativeTokenCount,
      inputCostPerMillionTokens: NativeModelCost,
      outputCostPerMillionTokens: NativeModelCost,
    }),
  ),
});
export const ElysiaModelMetadata = Schema.Record(
  Schema.String,
  Schema.Struct({
    contextWindowTokens: NativeTokenCount,
    autoCompactWindowTokens: NativeTokenCount,
    pricing: Schema.optionalKey(ElysiaNativeModelPricing),
  }).check(
    Schema.makeFilter((value) => value.autoCompactWindowTokens < value.contextWindowTokens, {
      expected: "an auto-compact window below the model context length",
    }),
  ),
);
export type ElysiaModelMetadata = typeof ElysiaModelMetadata.Type;

const MODEL_NAMES: Record<string, string> = {
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "kimi-k3": "Kimi K3",
  "zai.glm-5.3": "GLM 5.3",
  "gpt-5.6-luna": "GPT 5.6 Luna",
  "gpt-5.3-codex": "GPT Codex 5.3",
  "gpt-5-4": "GPT 5.4",
  "gpt-5-4-mini": "GPT 5.4 Mini",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "gpt-6.1-sol": "GPT 6.1 Sol",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "deepseek-v4": "DeepSeek V4 Pro",
  "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "minimax-m2.5": "MiniMax M2.5",
  "xai.grok-4.6": "Grok 4.6",
  "mistral-large-3": "Mistral Large 3",
};

export function elysiaModelCatalog(
  slugs: ReadonlyArray<string>,
  defaultModel = "deepseek-v4.1-flash",
  metadata: ElysiaModelMetadata = {},
): ClaudeModelCatalog {
  return {
    models: [...new Set(slugs)].map((slug) => {
      const known = BUNDLED_CLAUDE_MODEL_CATALOG.models.find((entry) => entry.model.slug === slug);
      const capabilities: ModelCapabilities = GPT_EFFORT_MODELS.has(slug)
        ? {
            optionDescriptors: [
              {
                id: "effort",
                label: "Intelligence",
                type: "select",
                currentValue: "high",
                options: ["low", "medium", "high", "xhigh"].map((id) => ({
                  id,
                  label: id === "xhigh" ? "Extra High" : id[0]!.toUpperCase() + id.slice(1),
                  isDefault: id === "high",
                })),
              },
            ],
          }
        : (known?.model.capabilities ?? { optionDescriptors: [] });
      return {
        model: {
          slug,
          name: MODEL_NAMES[slug] ?? known?.model.name ?? slug,
          isCustom: false,
          isDefault: slug === defaultModel,
          capabilities: {
            ...capabilities,
            optionDescriptors: capabilities.optionDescriptors
              ?.filter((option) => option.id !== "contextWindow")
              .map((option) =>
                option.id === "effort" ? { ...option, label: "Intelligence" } : option,
              ),
          },
        },
        // Routed limits come from the installed CLI, never Claude's own model guesses.
        runtime: {
          ...known?.runtime,
          contextWindowTokens: undefined,
          fixedContextWindowTokens: metadata[slug]?.contextWindowTokens,
          autoCompactWindowTokens: metadata[slug]?.autoCompactWindowTokens,
        },
        compatibility: known?.compatibility ?? {},
      };
    }),
  };
}

export function elysiaModelEnvironment(
  environment: NodeJS.ProcessEnv,
  model: string | undefined,
  catalog?: ClaudeModelCatalog,
): NodeJS.ProcessEnv {
  if (!model) return environment;
  const runtime = catalog?.models.find((entry) => entry.model.slug === model)?.runtime;
  return {
    ...environment,
    ELYSIA_ACTIVE_MODEL: model,
    ...(runtime?.fixedContextWindowTokens === undefined
      ? {}
      : {
          CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(runtime.fixedContextWindowTokens),
        }),
    ...(runtime?.autoCompactWindowTokens === undefined
      ? {}
      : {
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(runtime.autoCompactWindowTokens),
        }),
    ...(GPT_EFFORT_MODELS.has(model)
      ? {
          ANTHROPIC_CUSTOM_MODEL_OPTION: model,
          ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES: "effort,xhigh_effort",
        }
      : {}),
  };
}
