import type { ModelCapabilities } from "@t3tools/contracts";
import { BUNDLED_CLAUDE_MODEL_CATALOG, type ClaudeModelCatalog } from "./ClaudeModelCatalog.ts";

// Gateway IDs from the supplied Elysia 0.3.8 package; native settings take
// precedence after setup/update. Keep IDs opaque when dispatching to Claude.
export const ELYSIA_MODELS = [
  "kimi-k2.7-code",
  "kimi-k3",
  "zai.glm-5.3",
  "gpt-5.6-luna",
  "gpt-5.3-codex",
  "gpt-5-4",
  "gpt-5-4-mini",
  "claude-sonnet-5",
  "claude-haiku-4-5",
  "deepseek-v4",
  "deepseek-v4.1-flash",
  "minimax-m2.5",
  "xai.grok-4.6",
  "mistral-large-3",
];

const GPT_EFFORT_MODELS = new Set(["gpt-5.6-luna", "gpt-5.3-codex", "gpt-5-4", "gpt-5-4-mini"]);

const MODEL_NAMES: Record<string, string> = {
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "kimi-k3": "Kimi K3",
  "zai.glm-5.3": "GLM 5.3",
  "gpt-5.6-luna": "GPT 5.6 Luna",
  "gpt-5.3-codex": "GPT Codex 5.3",
  "gpt-5-4": "GPT 5.4",
  "gpt-5-4-mini": "GPT 5.4 Mini",
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
        // The gateway catalog declares model IDs, not selectable window sizes.
        runtime: {
          ...known?.runtime,
          contextWindowTokens: undefined,
          fixedContextWindowTokens: undefined,
        },
        compatibility: known?.compatibility ?? {},
      };
    }),
  };
}

export function elysiaModelEnvironment(
  environment: NodeJS.ProcessEnv,
  model: string | undefined,
): NodeJS.ProcessEnv {
  if (!model) return environment;
  return {
    ...environment,
    ELYSIA_ACTIVE_MODEL: model,
    ...(GPT_EFFORT_MODELS.has(model)
      ? {
          ANTHROPIC_CUSTOM_MODEL_OPTION: model,
          ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES: "effort,xhigh_effort",
        }
      : {}),
  };
}
