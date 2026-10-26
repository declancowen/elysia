// @effect-diagnostics nodeBuiltinImport:off -- native profile paths belong to the server host.
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

export class ElysiaQuerySettingsError extends Schema.TaggedError<ElysiaQuerySettingsError>()(
  "ElysiaQuerySettingsError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not prepare the native model settings for this query.";
  }
}

const settingsJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const decodeSettings = Schema.decodeEffect(settingsJson);
const encodeSettings = Schema.encodeEffect(settingsJson);
const MODEL_ENVIRONMENT_KEYS = new Set([
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "ANTHROPIC_CUSTOM_HEADERS",
  "CC_LANGSMITH_METADATA",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
  "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
  "CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT",
  "ANTHROPIC_CUSTOM_MODEL_OPTION",
  "ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES",
]);

// User settings.env overrides process.env in Claude. The flag-tier file wins without putting private headers in argv.
export const writeElysiaQuerySettings = Effect.fn("ElysiaQuerySettings.write")(
  function* (input: {
    readonly environment: NodeJS.ProcessEnv;
    readonly settings?: object | string;
  }) {
    const root = input.environment.ELYSIA_PROFILE_ROOT;
    if (!root || !input.environment.ELYSIA_ACTIVE_MODEL) return undefined;
    const fs = yield* FileSystem.FileSystem;
    const settings =
      typeof input.settings === "string"
        ? yield* fs.readFileString(input.settings).pipe(Effect.flatMap(decodeSettings))
        : (input.settings ?? {});
    const privateDirectory = NodePath.join(root, ".elysia");
    yield* fs.makeDirectory(privateDirectory, { recursive: true, mode: 0o700 });
    const directory = yield* fs.makeTempDirectoryScoped({
      directory: privateDirectory,
      prefix: "query-settings-",
    });
    const file = NodePath.join(directory, "settings.json");
    const environment = Object.fromEntries(
      Object.entries(input.environment).filter(
        (entry): entry is [string, string] =>
          MODEL_ENVIRONMENT_KEYS.has(entry[0]) && entry[1] !== undefined,
      ),
    );
    const settingsEnvironment =
      "env" in settings && typeof settings.env === "object" && settings.env !== null
        ? settings.env
        : {};
    const content = yield* encodeSettings({
      ...settings,
      env: { ...settingsEnvironment, ...environment },
    });
    yield* fs.writeFileString(file, content, { flag: "wx", mode: 0o600 });
    return file;
  },
  Effect.mapError((cause) => new ElysiaQuerySettingsError({ cause })),
);
