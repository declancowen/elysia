import { ProjectReadFileError } from "@elysiatools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  buildElysiaProjectFileJsonSchema,
  parseElysiaProjectFile,
  ElysiaProjectFileFromJson,
  isMissingProjectFileError,
} from "./elysiaProjectFile.ts";

const encodeReadError = Schema.encodeSync(ProjectReadFileError);
const decodeReadError = Schema.decodeUnknownSync(ProjectReadFileError);

const decodeJson = Schema.decodeUnknownSync(ElysiaProjectFileFromJson);

describe("buildElysiaProjectFileJsonSchema", () => {
  it("emits a draft 2020-12 schema with the published $id", () => {
    const schema = buildElysiaProjectFileJsonSchema();

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe("/schema/elysia.json");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("documents every supported field", () => {
    const schema = buildElysiaProjectFileJsonSchema() as {
      properties: Record<
        string,
        {
          description?: string;
          items?: { properties: Record<string, unknown>; required: ReadonlyArray<string> };
        }
      >;
      required?: ReadonlyArray<string>;
    };

    expect(Object.keys(schema.properties).sort()).toEqual([
      "$schema",
      "defaultThreadEnvMode",
      "iconPath",
      "scripts",
      "worktreeSubmodules",
    ]);
    expect(schema.required).toBeUndefined();
    expect(schema.properties.iconPath?.description).toContain("Workspace-relative path");
    expect(schema.properties.defaultThreadEnvMode?.description).toContain("new threads start");

    const script = schema.properties.scripts?.items;
    expect(script?.required).toEqual(["name", "command"]);
    expect(Object.keys(script?.properties ?? {}).sort()).toEqual([
      "async",
      "autoOpenPreview",
      "command",
      "icon",
      "name",
      "previewUrl",
      "runOnWorktreeCreate",
    ]);
  });

  it("stays JSON-serializable", () => {
    const schema = buildElysiaProjectFileJsonSchema();
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});

describe("ElysiaProjectFileFromJson", () => {
  it("decodes lenient JSONC with comments and trailing commas", () => {
    const decoded = decodeJson(`{
      // team scripts
      "iconPath": "assets/logo.svg",
      "scripts": [
        { "name": "Dev", "command": "pnpm dev", },
      ],
    }`);

    expect(decoded.iconPath).toBe("assets/logo.svg");
    expect(decoded.scripts?.[0]).toEqual({ name: "Dev", command: "pnpm dev" });
  });

  it("fails on malformed JSON", () => {
    expect(() => decodeJson("{ not json")).toThrow();
  });
});

describe("parseElysiaProjectFile", () => {
  it("returns the decoded file for valid contents", () => {
    expect(parseElysiaProjectFile('{ "defaultThreadEnvMode": "worktree" }')).toEqual({
      defaultThreadEnvMode: "worktree",
    });
  });

  it("returns null for malformed or invalid contents", () => {
    expect(parseElysiaProjectFile("{ not json")).toBeNull();
    expect(parseElysiaProjectFile('{ "defaultThreadEnvMode": "spaceship" }')).toBeNull();
  });
});

describe("isMissingProjectFileError", () => {
  it("recognizes missing local and remote file errors", () => {
    expect(isMissingProjectFileError({ cause: { cause: { code: "ENOENT" } } })).toBe(true);
    expect(isMissingProjectFileError({ cause: { reason: { _tag: "NotFound" } } })).toBe(true);
  });
  it("recognizes a missing file after its RPC schema round trip", () => {
    const source = new ProjectReadFileError({
      cwd: "/repo",
      relativePath: "elysia.json",
      cause: {
        operation: "realpath-target",
        cause: Object.assign(new Error("missing file"), { code: "ENOENT" }),
      },
    });
    const encoded = encodeReadError(source);
    const decoded = Schema.decodeUnknownSync(ProjectReadFileError)(
      JSON.parse(JSON.stringify(encoded)),
    );
    expect(isMissingProjectFileError(decoded)).toBe(true);
  });
  it("does not treat permission, parse or missing workspace failures as absent config", () => {
    expect(isMissingProjectFileError({ cause: { code: "EACCES" } })).toBe(false);
    expect(isMissingProjectFileError(new Error("Malformed configuration"))).toBe(false);
    expect(
      isMissingProjectFileError({
        operation: "realpath-workspace-root",
        cause: { code: "ENOENT" },
      }),
    ).toBe(false);
    expect(isMissingProjectFileError(null)).toBe(false);
  });
});
