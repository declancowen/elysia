import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { ElysiaProjectFile, ELYSIA_PROJECT_FILE_SCHEMA_URL } from "@elysiatools/contracts";

import { fromLenientJson } from "./schemaJson.ts";

/**
 * Codec between the raw `elysia.json` file contents (lenient JSONC string) and the
 * decoded {@link ElysiaProjectFile}.
 */
export const ElysiaProjectFileFromJson = fromLenientJson(ElysiaProjectFile);

const decodeElysiaProjectFile = Schema.decodeExit(ElysiaProjectFileFromJson);

/**
 * Decode raw `elysia.json` contents, treating invalid or malformed files as
 * absent. Clients use this to read optional defaults (scripts, thread env
 * mode) without surfacing decode errors to the user.
 */
export function parseElysiaProjectFile(contents: string): ElysiaProjectFile | null {
  const decoded = decodeElysiaProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}

/**
 * Build the publishable JSON Schema document for `elysia.json` (draft 2020-12).
 *
 * Served from the marketing site at {@link ELYSIA_PROJECT_FILE_SCHEMA_URL} so
 * editors get LSP support via a `$schema` reference.
 */
export function buildElysiaProjectFileJsonSchema(): Record<string, unknown> {
  // Closed objects, as before effect rc.113 changed the generator default;
  // editors then flag unknown keys in elysia.json.
  const document = Schema.toJsonSchemaDocument(ElysiaProjectFile, { onExcessProperty: "error" });
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: ELYSIA_PROJECT_FILE_SCHEMA_URL,
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}

/** Read failures retain their nested platform cause across local and remote RPC. */
export function isMissingProjectFileError(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 4; depth++) {
    if (cause === null || typeof cause !== "object") return false;
    if ("operation" in cause && cause.operation === "realpath-workspace-root") return false;
    if ("code" in cause && cause.code === "ENOENT") return true;
    if (
      "reason" in cause &&
      cause.reason !== null &&
      typeof cause.reason === "object" &&
      "_tag" in cause.reason &&
      cause.reason._tag === "NotFound"
    )
      return true;
    cause = "cause" in cause ? cause.cause : null;
  }
  return false;
}
