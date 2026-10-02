// @effect-diagnostics nodeBuiltinImport:off - native SDK transcript boundary needs streaming Node readers.
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import * as Schema from "effect/Schema";

const LaunchOwner = Schema.Struct({
  parent_tool_use_id: Schema.optional(Schema.String),
  toolUseId: Schema.optional(Schema.String),
});
const decodeOwner = Schema.decodeUnknownOption(Schema.fromJsonString(LaunchOwner));

export async function hasElysiaNativeSession(
  configDir: string,
  sessionId: string,
): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) return false;
  let projects: NodeFS.Dirent[];
  try {
    projects = await NodeFSP.readdir(NodePath.join(configDir, "projects"), { withFileTypes: true });
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
    throw cause;
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const entries = await NodeFSP.readdir(NodePath.join(configDir, "projects", project.name), {
      withFileTypes: true,
    });
    if (entries.some((entry) => entry.isFile() && entry.name === `${sessionId}.jsonl`)) return true;
  }
  return false;
}

async function findTranscript(directory: string, filename: string): Promise<string | null> {
  let entries: NodeFS.Dirent[];
  try {
    entries = await NodeFSP.readdir(directory, { withFileTypes: true });
  } catch (cause) {
    if (
      cause instanceof Error &&
      "code" in cause &&
      (cause.code === "ENOENT" || cause.code === "ENOTDIR")
    ) {
      return null;
    }
    throw cause;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name === filename) return NodePath.join(directory, entry.name);
  }
  for (const entry of entries) {
    // Native team transcripts can nest under subagents; never follow profile symlinks.
    if (!entry.isDirectory()) continue;
    const found = await findTranscript(NodePath.join(directory, entry.name), filename);
    if (found) return found;
  }
  return null;
}

/** SDK transcript helpers use ambient Claude home; Elysia must stay in its isolated profile. */
export async function readElysiaSubagentLaunchToolUseId(
  configDir: string,
  sessionId: string,
  agentId: string,
): Promise<string | null> {
  if (![sessionId, agentId].every((id) => /^[a-zA-Z0-9_-]+$/.test(id))) return null;
  const projects = NodePath.join(configDir, "projects");
  for (const directory of await NodeFSP.readdir(projects, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const file = await findTranscript(
      NodePath.join(projects, directory.name, sessionId, "subagents"),
      `agent-${agentId}.jsonl`,
    );
    if (file === null) continue;
    const stream = NodeFS.createReadStream(file, { encoding: "utf8" });
    const lines = NodeReadline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        const owner = decodeOwner(line);
        if (owner._tag === "Some") {
          const id = owner.value.parent_tool_use_id ?? owner.value.toolUseId;
          if (id) return id;
        }
      }
    } finally {
      lines.close();
      stream.destroy();
    }
  }
  return null;
}
