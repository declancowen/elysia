// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as NodeFSP from "node:fs/promises";
import * as NodeFS from "node:fs";
import * as NodeChildProcess from "node:child_process";
import * as NodeUtil from "node:util";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

function canonicalPath(path: string): string {
  try {
    return NodeFS.realpathSync(path);
  } catch {
    const parent = NodePath.dirname(path);
    return parent === path ? path : NodePath.join(canonicalPath(parent), NodePath.basename(path));
  }
}

function privateEntries(directory: string, publicNames: ReadonlyArray<string>): string[] {
  try {
    return NodeFS.readdirSync(directory)
      .filter((name) => !publicNames.includes(name))
      .map((name) => NodePath.join(directory, name));
  } catch {
    return NodeFS.existsSync(directory) ? [directory] : [];
  }
}

/** Enforce protection in the harness, including full-access turns. Prompts are not a boundary. */
export function elysiaAgentProtection(
  environment: NodeJS.ProcessEnv,
  onModelChange?: (model: string) => Promise<void>,
): Pick<Options, "hooks" | "settings"> & {
  sandbox?: NonNullable<NonNullable<Options["managedSettings"]>["sandbox"]>;
} {
  const root = environment.ELYSIA_PROFILE_ROOT;
  if (!root) return {};
  const home = environment.ELYSIA_REAL_HOME || process.env.HOME || process.env.USERPROFILE || "";
  const nativeClaudeDir = environment.ELYSIA_NATIVE_CLAUDE_DIR || NodePath.join(home, ".claude");
  const protectedPaths = [
    ...privateEntries(root, [".claude", "bin", "runtime", "ca.pem"]),
    ...privateEntries(NodePath.join(root, ".claude"), ["skills", "commands"]),
    ...["settings.json", "settings.local.json", ".credentials.json", "plugins"].map((name) =>
      NodePath.join(root, ".claude", name),
    ),
    NodePath.join(root, ".elysia"),
    NodePath.join(root, ".zshrc"),
    NodePath.join(root, ".bashrc"),
    NodePath.join(root, "setup-mac.sh"),
    NodePath.join(root, "setup-windows.cmd"),
    NodePath.join(home, ".elysia"),
    ...privateEntries(nativeClaudeDir, ["skills", "commands"]),
    ...["settings.json", "settings.local.json", ".credentials.json"].map((name) =>
      NodePath.join(nativeClaudeDir, name),
    ),
    NodePath.join(home, ".claude.json"),
    NodePath.join(home, ".zshrc"),
    NodePath.join(home, ".bashrc"),
    NodePath.join(home, "Library", "LaunchAgents"),
    ...(environment.ELYSIA_STATE_DIR
      ? [
          ...["secrets", "settings.json"].map((name) =>
            NodePath.join(environment.ELYSIA_STATE_DIR!, name),
          ),
          ...privateEntries(NodePath.join(environment.ELYSIA_STATE_DIR, "providers"), [
            NodePath.basename(root),
          ]),
        ]
      : []),
  ].map(canonicalPath);
  const secretNames = Object.keys(environment).filter((name) =>
    /(?:KEY|TOKEN|CUSTOM_HEADERS|EXTRA_HEADERS|SECRET|PASSWORD)$/.test(name),
  );
  return {
    settings: {
      permissions: {
        deny: protectedPaths.flatMap((path) => ["Read(/" + path + ")", "Read(/" + path + "/**)"]),
      },
    },
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      // Credential protection should not interrupt normal package installs or dev servers.
      network: { allowedDomains: ["*"], allowLocalBinding: true },
      filesystem: {
        disabled: false,
        denyRead: protectedPaths,
        denyWrite: protectedPaths,
        ...(environment.SSL_CERT_FILE ? { allowRead: [environment.SSL_CERT_FILE] } : {}),
      },
      credentials: {
        files: protectedPaths.map((path) => ({ path, mode: "deny" })),
        envVars: secretNames.map((name) => ({ name, mode: "deny" })),
      },
    },
    hooks: {
      PreToolUse: [
        {
          timeout: 180,
          hooks: [
            async (input) => {
              if (input.hook_event_name !== "PreToolUse") return {};
              const args = input.tool_input as Record<string, unknown>;
              // Native slash commands still execute the native CLI. The host runs only
              // these exact operations and supplies their redacted output to Bash;
              // credentials never become readable by the sandboxed command.
              const nativeCommand =
                input.tool_name === "Bash" && typeof args.command === "string"
                  ? /^\s*elysia-code\s+(--config|--models|--model|--compression-stats|--compression-enable|--compression-disable)(?:\s+([a-zA-Z0-9._-]+))?\s*$/.exec(
                      args.command,
                    )
                  : null;
              if (
                nativeCommand &&
                (nativeCommand[1] === "--model" ? nativeCommand[2] : !nativeCommand[2])
              ) {
                try {
                  if (nativeCommand[1] === "--model") {
                    const data: unknown = JSON.parse(
                      await NodeFSP.readFile(
                        NodePath.join(root, ".claude", "settings.json"),
                        "utf8",
                      ),
                    );
                    const models =
                      typeof data === "object" && data !== null && "allowed_models" in data
                        ? data.allowed_models
                        : null;
                    if (!Array.isArray(models) || !models.includes(nativeCommand[2]))
                      return {
                        hookSpecificOutput: {
                          hookEventName: "PreToolUse",
                          permissionDecision: "deny",
                          permissionDecisionReason: "Choose an available Elysia model.",
                        },
                      };
                  }
                  const { stdout, stderr } = await NodeUtil.promisify(NodeChildProcess.execFile)(
                    environment.ELYSIA_PYTHON || "python3",
                    [
                      NodePath.join(root, "elysia-bridge.py"),
                      NodePath.join(root, "elysia-code.py"),
                      root,
                      nativeCommand[1]!,
                      ...(nativeCommand[2] ? [nativeCommand[2]] : []),
                    ],
                    { env: environment, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
                  );
                  if (nativeCommand[1] === "--model" && nativeCommand[2])
                    await onModelChange?.(nativeCommand[2]);
                  let output = stdout + stderr;
                  if (nativeCommand[1] === "--config" && environment.ELYSIA_ACTIVE_MODEL)
                    output +=
                      "\nThread model: " +
                      environment.ELYSIA_ACTIVE_MODEL +
                      "\nThe configuration model above is the CLI default.\n";
                  for (const name of secretNames) {
                    const secret = environment[name];
                    if (secret && secret.length >= 5) output = output.replaceAll(secret, "****");
                  }
                  return {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse",
                      permissionDecision: "allow",
                      updatedInput: {
                        ...args,
                        command: "printf '%s' '" + output.replaceAll("'", "'\\''") + "'",
                      },
                    },
                  };
                } catch {
                  return {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse",
                      permissionDecision: "deny",
                      permissionDecisionReason:
                        "Elysia could not complete that CLI operation. Check Settings → Providers and the company network.",
                    },
                  };
                }
              }
              let blocked = input.tool_name === "Bash" && args.dangerouslyDisableSandbox === true;
              for (const field of ["file_path", "path", "notebook_path"]) {
                const value = args[field];
                if (typeof value !== "string") continue;
                const absolute = NodePath.resolve(input.cwd, value.replace(/^~(?=[/\\]|$)/, home));
                const canonical = canonicalPath(absolute);
                blocked ||=
                  canonical !== environment.SSL_CERT_FILE &&
                  protectedPaths.some(
                    (path) => canonical === path || canonical.startsWith(path + NodePath.sep),
                  );
              }
              return blocked
                ? {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse",
                      permissionDecision: "deny",
                      permissionDecisionReason:
                        "Elysia credentials are protected. Use Settings → Providers for configuration.",
                    },
                  }
                : {};
            },
          ],
        },
      ],
    },
  };
}
