import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { ElysiaProjectFile, ELYSIA_PROJECT_FILE_SCHEMA_URL } from "@elysiatools/contracts";

import { fromLenientJson } from "./schemaJson.ts";

export const ElysiaProjectFileFromJson = fromLenientJson(ElysiaProjectFile);

const decodeElysiaProjectFile = Schema.decodeExit(ElysiaProjectFileFromJson);

export function parseElysiaProjectFile(contents: string): ElysiaProjectFile | null {
  const decoded = decodeElysiaProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}

export function buildElysiaProjectFileJsonSchema(): Record<string, unknown> {
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
