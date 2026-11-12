// @effect-diagnostics nodeBuiltinImport:off - syncs the native Claude profile files without changing their permissions.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as Schema from "effect/Schema";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ElysiaMcpRegistration } from "@elysiatools/contracts";
import type { ProviderInstance } from "@elysiatools/provider-core/server/driver";
import * as Effect from "effect/Effect";

const record = Schema.Record(Schema.String, Schema.Unknown);
const decodeRecord = Schema.decodeUnknownOption(record);
const decodeConfig = Schema.decodeSync(Schema.fromJsonString(record));
const decodeDisabled = Schema.decodeUnknownOption(Schema.Array(Schema.String));
const strings = Schema.Record(Schema.String, Schema.String);
const toolPolicy = Schema.mutable(
  Schema.Array(
    Schema.Struct({
      name: Schema.String,
      permission_policy: Schema.optionalKey(
        Schema.Literals(["always_allow", "always_ask", "always_deny"]),
      ),
      org_max_permission: Schema.optionalKey(Schema.Literals(["allow", "ask", "blocked"])),
    }),
  ),
);
const transportOptions = {
  timeout: Schema.optionalKey(Schema.Number),
  alwaysLoad: Schema.optionalKey(Schema.Boolean),
};
const decodeMcpServer = Schema.decodeUnknownOption(
  Schema.Union([
    Schema.Struct({
      type: Schema.optionalKey(Schema.Literal("stdio")),
      command: Schema.String,
      args: Schema.optionalKey(Schema.mutable(Schema.Array(Schema.String))),
      env: Schema.optionalKey(strings),
      ...transportOptions,
    }),
    Schema.Struct({
      type: Schema.Literals(["http", "sse"]),
      url: Schema.String,
      headers: Schema.optionalKey(strings),
      tools: Schema.optionalKey(toolPolicy),
      ...transportOptions,
    }),
  ]),
);

const asRecord = (value: unknown) => {
  const decoded = decodeRecord(value);
  return decoded._tag === "Some" ? decoded.value : {};
};

const disabledServers = (value: unknown) => {
  const decoded = decodeDisabled(value);
  return decoded._tag === "Some" ? decoded.value : [];
};

const fingerprint = (value: unknown) =>
  NodeCrypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const readConfig = (file: string) =>
  NodeFSP.readFile(file, "utf8").catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  });

export const readElysiaMcpInventory = Effect.fn("ElysiaMcpConfig.readInventory")(function* (
  instances: ReadonlyArray<ProviderInstance>,
) {
  const groups = yield* Effect.forEach(instances, (instance) =>
    (instance.elysiaMcpRegistrations ?? Effect.succeed([])).pipe(
      Effect.map((rows) => rows.map((row) => ({ ...row, id: `${instance.instanceId}:${row.id}` }))),
    ),
  );
  return groups.flat();
});

function mergeScope(native: unknown, managed: unknown) {
  const source = asRecord(native);
  const profile = asRecord(managed);
  return {
    mcpServers: { ...asRecord(source.mcpServers), ...asRecord(profile.mcpServers) },
    disabledMcpServers: [
      ...disabledServers(source.disabledMcpServers),
      ...disabledServers(profile.disabledMcpServers),
    ],
  };
}

export async function listElysiaMcpRegistrations(
  nativeFile: string,
  managedFile: string,
): Promise<ReadonlyArray<ElysiaMcpRegistration>> {
  const [nativeText, managedText] = await Promise.all([
    readConfig(nativeFile),
    readConfig(managedFile),
  ]);
  const native = nativeText === null ? {} : decodeConfig(nativeText);
  const managed = managedText === null ? {} : decodeConfig(managedText);
  const nativeProjects = asRecord(native.projects);
  const managedProjects = asRecord(managed.projects);
  const user = mergeScope(native, managed);
  const toRows = (scope: typeof user, project: string | null): ElysiaMcpRegistration[] =>
    Object.entries(scope.mcpServers).map(([name, definition]) => {
      const { type, command } = asRecord(definition);
      return {
        id: fingerprint([project, name]),
        name,
        project: project === null ? null : NodePath.basename(project),
        transport:
          type === "http" || type === "sse" || type === "stdio"
            ? type
            : typeof command === "string"
              ? "stdio"
              : null,
        disabled: scope.disabledMcpServers.includes(name),
      };
    });
  return [
    ...toRows(user, null),
    ...Array.from(
      new Set([...Object.keys(nativeProjects), ...Object.keys(managedProjects)]),
    ).flatMap((project) =>
      toRows(mergeScope(nativeProjects[project], managedProjects[project]), project),
    ),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ElysiaQueryMcp {
  readonly revision: string | null;
  readonly servers: Record<string, McpServerConfig>;
}

export async function readElysiaQueryMcp(input: {
  readonly nativeFile: string;
  readonly managedFile: string;
  readonly cwd: string;
}): Promise<ElysiaQueryMcp> {
  const { nativeFile, managedFile } = input;
  const cwd = await NodeFSP.realpath(input.cwd).catch(() => input.cwd);
  const [nativeText, managedText, projectText] = await Promise.all([
    nativeFile === managedFile ? null : readConfig(nativeFile),
    readConfig(managedFile),
    readConfig(NodePath.join(cwd, ".mcp.json")),
  ]);
  const native = nativeText === null ? {} : decodeConfig(nativeText);
  const managed = managedText === null ? {} : decodeConfig(managedText);
  const project = projectText === null ? {} : decodeConfig(projectText);
  const nativeLocal = asRecord(asRecord(native.projects)[cwd]);
  const managedLocal = asRecord(asRecord(managed.projects)[cwd]);
  // Claude loads managed and repository registrations itself. Reserve their names before adding session servers.
  const reserved = new Set([
    ...Object.keys(asRecord(managed.mcpServers)),
    ...Object.keys(asRecord(managedLocal.mcpServers)),
    ...Object.keys(asRecord(project.mcpServers)),
    ...disabledServers(native.disabledMcpServers),
    ...disabledServers(nativeLocal.disabledMcpServers),
    ...disabledServers(managed.disabledMcpServers),
    ...disabledServers(managedLocal.disabledMcpServers),
  ]);
  const servers = Object.fromEntries(
    Object.entries({
      ...asRecord(native.mcpServers),
      ...asRecord(nativeLocal.mcpServers),
    }).flatMap(([name, config]) => {
      if (reserved.has(name)) return [];
      const parsed = decodeMcpServer(config);
      return parsed._tag === "Some" ? [[name, parsed.value] as const] : [];
    }),
  );
  return {
    revision:
      nativeText === null && managedText === null && projectText === null
        ? null
        : fingerprint([servers, mergeScope(managed, managedLocal), project.mcpServers]),
    servers,
  };
}
