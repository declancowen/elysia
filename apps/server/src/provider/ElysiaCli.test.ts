// @effect-diagnostics nodeBuiltinImport:off - exercise the real native Python subprocess and owned profile filesystem.
import * as NodeChildProcess from "node:child_process";
import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { it as effectIt } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ClaudeSettings, ProviderInstanceId } from "@t3tools/contracts";
import { SpawnExecutableResolution } from "@t3tools/shared/shell";
import { HostProcessArchitecture, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";
import { ELYSIA_CLI_BRIDGE, makeElysiaCli, syncElysiaExtensions } from "./ElysiaCli.ts";
import { elysiaAgentProtection } from "./ElysiaAgentProtection.ts";

const fixtures: string[] = [];
const decodeClaudeSettings = Schema.decodeSync(ClaudeSettings);
afterEach(() => {
  for (const directory of fixtures.splice(0))
    NodeFS.rmSync(directory, { recursive: true, force: true });
});

const nativeFixture = String.raw`
import json, os, shutil, ssl, subprocess, sys
from pathlib import Path
CLI_VERSION = "0.3.8"
HOME = Path.home()
ELYSIA_DIR = HOME / ".elysia"
COMPRESSION_STATE = ELYSIA_DIR / "compression.json"
CERT_FILE = HOME / "ca.pem"
IS_MAC, IS_WINDOWS = True, False
CLAUDE_DIR = HOME / ".claude"
def _init_globals():
    global GATEWAY_URL
    GATEWAY_URL = os.environ["ELYSIA_GATEWAY_URL"]
def check_claude_installed():
    pass
def setup_ssl():
    shutil.copyfile(ssl.get_default_verify_paths().cafile, CERT_FILE)
def validate_gateway_credentials(key, config, model):
    if key == "invalid-secret":
        sys.exit(1)
def install_langsmith_plugin():
    plugin = "langsmith-tracing@langsmith-claude-code-plugins"
    install = CLAUDE_DIR / "plugins/cache/langsmith"
    install.mkdir(parents=True, exist_ok=True)
    (CLAUDE_DIR / "plugins/installed_plugins.json").write_text(json.dumps({"plugins": {plugin: [{"installPath": str(install)}]}}))
    settings = CLAUDE_DIR / "settings.json"
    data = json.loads(settings.read_text())
    data["enabledPlugins"] = {plugin: True}
    settings.write_text(json.dumps(data))
def deploy_claude_md():
    pass
def deploy_elysia_config_command():
    pass
def deploy_elysia_model_command():
    pass
def deploy_elysia_compression_command():
    command = CLAUDE_DIR / "commands/elysia-compression.md"
    command.parent.mkdir(parents=True, exist_ok=True)
    command.write_text("curl http://localhost:8787/stats\nhttp://localhost:8787/dashboard")
def _read_compression_state():
    return json.loads(COMPRESSION_STATE.read_text())
def _write_compression_state(enabled, port=8787):
    COMPRESSION_STATE.write_text(json.dumps({"enabled": enabled, "port": port}))
def main():
    if "--init" in sys.argv:
        key = sys.argv[sys.argv.index("--api-key") + 1]
        print("credential " + key)
        print("secret " + key, file=sys.stderr)
        if key == "invalid-secret":
            sys.exit(1)
        config = HOME / ".claude"
        config.mkdir(exist_ok=True)
        (config / "settings.json").write_text(json.dumps({"env": {"ANTHROPIC_AUTH_TOKEN": key, "ANTHROPIC_BASE_URL": "https://fixture.invalid", "ANTHROPIC_CUSTOM_HEADERS": "x-portkey-api-key: " + key + "\nx-portkey-config:config", "CC_LANGSMITH_METADATA": json.dumps({"workspace_id": "workspace", "config_id": "config", "user_id": "user", "compression": "disabled"}), "NODE_EXTRA_CA_CERTS": str(CERT_FILE)}, "allowed_models": ["deepseek-v4.1-flash"], "model": "deepseek-v4.1-flash"}))
        deploy_elysia_compression_command()
        record()
    elif "--config" in sys.argv:
        print("Model : deepseek-v4.1-flash")
        print("accidental credential " + os.environ.get("ANTHROPIC_AUTH_TOKEN", ""))
    elif "--compression-disable" in sys.argv:
        _write_compression_state(False)
    elif "--compression-stats" in sys.argv:
        print(json.dumps({"home": str(HOME), "port": _read_compression_state()["port"]}))
    elif "--update" in sys.argv:
        script = Path(__file__)
        script.write_text(script.read_text().replace('CLI_VERSION = "0.3.8"', 'CLI_VERSION = "0.3.9"'))
        subprocess.run([sys.executable, str(script), "--finish-update", CLI_VERSION], check=True)
    elif "--finish-update" in sys.argv:
        record()
def record():
    (HOME / "record.json").write_text(json.dumps({"home": str(HOME), "mcp": str(MCP_FILE), "label": PLIST_LABEL, "version": CLI_VERSION, "gateway": os.environ.get("ELYSIA_GATEWAY_URL")}))
`;

function fixture() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "elysia-cli-test-"));
  fixtures.push(directory);
  const source = NodePath.join(directory, "elysia-code.py");
  const profile = NodePath.join(directory, "profile");
  NodeFS.writeFileSync(source, nativeFixture);
  NodeFS.writeFileSync(
    NodePath.join(directory, "setup-mac.sh"),
    'export ELYSIA_GATEWAY_URL="https://fixture.invalid"\n',
  );
  const run = (
    operation: string,
    key = "fixture-secret",
    extraEnv: Record<string, string> = {},
    bridge = ELYSIA_CLI_BRIDGE,
  ) =>
    NodeChildProcess.spawnSync("python3", ["-c", bridge, source, profile, operation], {
      env: {
        ...process.env,
        HOME: directory,
        ELYSIA_CLI_BRIDGE,
        ELYSIA_GATEWAY_URL: "https://fixture.invalid",
        ...extraEnv,
      },
      input: JSON.stringify({
        workspace_id: "workspace",
        config_id: "config",
        user_id: "user",
        api_key: key,
      }),
      encoding: "utf8",
    });
  return { source, profile, run, directory };
}

for (const [platform, scenario] of [
  ["darwin", "missing"],
  ["darwin", "existing"],
  ["darwin", "bad-checksum"],
  ["win32", "missing"],
  ["win32", "existing"],
] as const) {
  effectIt.effect(
    `${platform}: ${
      scenario === "missing"
        ? "installs verified standalone runtimes and Claude before preparing Elysia"
        : scenario === "existing"
          ? "reuses native Claude and Python without Node or Homebrew installation"
          : "rejects a runtime checksum mismatch before extraction or CLI bootstrap"
    }`,
    () => {
      const { directory, source } = fixture();
      const python = platform === "win32" ? "python" : "python3";
      const installed = new Set(
        scenario === "existing" ? ["git", python, "claude"] : platform === "darwin" ? ["git"] : [],
      );
      const calls: string[][] = [];
      const checksum = "a".repeat(64);
      let prepared = false;
      const spawner = ChildProcessSpawner.make((command) => {
        if (command._tag !== "StandardCommand") throw new Error("Unexpected pipeline");
        const binary = command.command.replaceAll('^"', "");
        const args = command.args.map((arg) => arg.replaceAll('^"', ""));
        if (platform === "win32" && binary === "npm.cmd") expect(command.options.shell).toBe(true);
        calls.push([binary, ...args]);
        if (platform === "darwin")
          expect(command.options.env?.PATH).toContain(
            NodePath.join(NodeOS.homedir(), ".local/python/bin"),
          );
        else expect(command.options.env?.PATH).toContain("Python313");
        let code = 0,
          stdout = "";
        if (binary === "winget") {
          const id = args[args.indexOf("--id") + 1];
          if (id === "OpenJS.NodeJS.LTS") {
            installed.add("node");
            installed.add("npm.cmd");
          } else if (id === "Python.Python.3.13") installed.add(python);
          else if (id === "Git.Git") installed.add("git");
        } else if (binary === "curl") {
          if (args.at(-1)?.endsWith("SHASUMS256.txt"))
            stdout = `${checksum}  node-v24.21.0-darwin-arm64.tar.gz\n`;
          else if (args.at(-1)?.endsWith(".sha256")) stdout = checksum;
        } else if (binary === "shasum") {
          stdout = `${scenario === "bad-checksum" ? "b".repeat(64) : checksum}  ${args.at(-1)}`;
        } else if (binary === "tar") {
          expect(args.at(-1)).toContain(
            NodePath.join(directory, "providers", "elysia-installer-test", "runtime"),
          );
          if (args[1]?.includes("node-v")) {
            installed.add("node");
            installed.add("npm");
          } else installed.add("python3");
        } else if (binary === "npm" || binary === "npm.cmd") installed.add("claude");
        else if (binary === python && args.includes("bootstrap"))
          prepared = installed.has("claude");
        else if (!installed.has(binary)) code = 127;
        else
          stdout = binary === "node" ? "v24.21.0" : binary === "claude" ? "2.1.285" : "installed";
        return Effect.succeed(
          ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(1),
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(code)),
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            unref: Effect.succeed(Effect.void),
            stdin: Sink.drain,
            stdout: Stream.encodeText(Stream.make(stdout)),
            stderr: Stream.empty,
            all: Stream.empty,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
          }),
        );
      });
      const progress: string[] = [];
      const config = decodeClaudeSettings({ enabled: false, elysiaScriptPath: source });
      return Effect.gen(function* () {
        const cli = yield* makeElysiaCli({
          instanceId: ProviderInstanceId.make("installer-test"),
          stateDir: directory,
          config,
          environment: { LOCALAPPDATA: NodePath.join(directory, "AppData/Local") },
          checkUpdates: Effect.succeed(false),
        });
        expect(yield* cli.version).toBe("0.3.8");
        const result = yield* cli
          .bootstrap((message) =>
            Effect.sync(() => {
              progress.push(message);
            }),
          )
          .pipe(Effect.result);
        expect(yield* cli.ready).toBe(false);
        expect(calls.some(([binary]) => binary === "brew" || binary === "/bin/bash")).toBe(false);
        if (scenario === "bad-checksum") {
          expect(result._tag).toBe("Failure");
          expect(calls.some(([binary]) => binary === "tar")).toBe(false);
          expect(prepared).toBe(false);
        } else {
          expect(result._tag, "native fixture installation").toBe("Success");
          expect(prepared).toBe(true);
          expect(progress.at(-1)).toContain("Enter your company credentials");
          if (scenario === "existing") {
            expect(calls.some(([binary]) => ["curl", "tar", "npm", "node"].includes(binary!))).toBe(
              false,
            );
          } else {
            expect(installed.has("claude")).toBe(true);
            expect(installed.has(python)).toBe(true);
            if (platform === "win32")
              expect(
                calls
                  .filter(([binary]) => binary === "winget")
                  .map((call) => call[call.indexOf("--id") + 1]),
              ).toEqual(["OpenJS.NodeJS.LTS", "Python.Python.3.13", "Git.Git"]);
            expect(calls.find(([binary]) => binary === "npm" || binary === "npm.cmd")).toContain(
              "@anthropic-ai/claude-code",
            );
          }
        }
      }).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.provideService(HostProcessPlatform, platform),
        Effect.provideService(SpawnExecutableResolution, (command) => command),
        Effect.provideService(HostProcessArchitecture, "arm64"),
        Effect.scoped,
        Effect.provide(NodeServices.layer),
      );
    },
  );
}

it("downloads into private app data, runs native setup in its folder and cleans up", () => {
  const { source, directory, profile, run } = fixture();
  NodeFS.rmSync(source);
  const prefix = String.raw`
import io, os, subprocess, zipfile
from pathlib import Path
original_run = subprocess.run
def installer(command, *args, **kwargs):
    if command[0] == "curl":
        assert command[-1] == "https://pilots.ai.informa.com/elysia-code/releases/elysia-code-latest.zip"
        target = Path(command[command.index("--output") + 1])
        assert target.parent.parent.name == "profile"
        with zipfile.ZipFile(target, "w") as archive:
            archive.writestr("elysia-code-latest/elysia-code.py", os.environ["FIXTURE_SCRIPT"])
            archive.writestr("elysia-code-latest/setup-mac.sh", 'mkdir -p "$HOME/.local/bin"\ncp ./elysia-code.py "$HOME/.local/bin/elysia-code.py"\n')
            archive.writestr("elysia-code-latest/setup-windows.cmd", "@echo off\n")
            if os.environ.get("UNSAFE_PACKAGE"):
                archive.writestr("../outside.py", "bad")
        return subprocess.CompletedProcess(command, 0)
    return original_run(command, *args, **kwargs)
subprocess.run = installer
`;
  const bridge = prefix + ELYSIA_CLI_BRIDGE;
  const result = run("bootstrap", "", { FIXTURE_SCRIPT: nativeFixture }, bridge);
  expect(result.status, result.stderr).toBe(0);
  expect(NodeFS.readFileSync(NodePath.join(directory, ".local/bin/elysia-code.py"), "utf8")).toBe(
    nativeFixture,
  );
  expect(NodeFS.readFileSync(NodePath.join(profile, "elysia-code.py"), "utf8")).toBe(nativeFixture);
  expect(NodeFS.readdirSync(profile).some((name) => name.startsWith("setup-"))).toBe(false);
  expect(NodeFS.existsSync(NodePath.join(directory, "Downloads"))).toBe(false);
  NodeFS.rmSync(NodePath.join(directory, ".local/bin/elysia-code.py"));
  NodeFS.rmSync(NodePath.join(profile, "elysia-code.py"));
  const invalid = run(
    "bootstrap",
    "",
    { FIXTURE_SCRIPT: nativeFixture, UNSAFE_PACKAGE: "1" },
    bridge,
  );
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("ELYSIA_ERROR:package-invalid");
  expect(NodeFS.readdirSync(profile).some((name) => name.startsWith("setup-"))).toBe(false);
  expect(NodeFS.existsSync(NodePath.join(directory, "outside.py"))).toBe(false);
});

it("checks the version inside latest ZIP and avoids transferring an unchanged package", () => {
  const { source, profile, run } = fixture();
  NodeFS.appendFileSync(source, '\nUPDATE_ZIP_URL = "https://fixture.invalid/latest.zip"\n');
  const prefix = String.raw`
import io, json, urllib.error, urllib.request, zipfile
from pathlib import Path
calls = Path(__import__("sys").argv[2]) / "update-http.json"
def request(req, **kwargs):
    cache = calls.exists()
    calls.write_text(json.dumps({"conditional": req.headers.get("If-none-match"), "bodyDownloaded": not cache}))
    if cache:
        assert req.headers["If-none-match"] == '"release-9"'
        raise urllib.error.HTTPError(req.full_url, 304, "Not modified", {}, None)
    body = io.BytesIO()
    with zipfile.ZipFile(body, "w") as archive:
        archive.writestr("elysia-code-latest/elysia-code.py", 'CLI_VERSION = "0.3.9"')
    class Response(io.BytesIO):
        headers = {"ETag": '"release-9"'}
    return Response(body.getvalue())
urllib.request.urlopen = request
`;
  const bridge = prefix + ELYSIA_CLI_BRIDGE;
  expect(run("latest", "", {}, bridge).stdout.trim()).toBe("0.3.9");
  expect(
    JSON.parse(NodeFS.readFileSync(NodePath.join(profile, "update-http.json"), "utf8"))
      .bodyDownloaded,
  ).toBe(true);
  expect(run("latest", "", {}, bridge).stdout.trim()).toBe("0.3.9");
  expect(
    JSON.parse(NodeFS.readFileSync(NodePath.join(profile, "update-http.json"), "utf8")),
  ).toEqual({ conditional: '"release-9"', bodyDownloaded: false });
  expect(NodeFS.readdirSync(profile).some((name) => name.endsWith(".zip"))).toBe(false);
});

it("initialises the native package in its owned profile, with credentials only on stdin", () => {
  const { source, profile, run } = fixture();
  const result = run("--init");
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe("Elysia 0.3.8\n");
  expect(result.stderr).toBe("");
  expect(NodeFS.readFileSync(source, "utf8")).toBe(nativeFixture);
  expect(
    JSON.parse(NodeFS.readFileSync(NodePath.join(profile, "record.json"), "utf8")),
  ).toMatchObject({
    home: profile,
    mcp: NodePath.join(profile, ".claude", ".claude.json"),
    version: "0.3.8",
  });
  expect(NodeFS.readFileSync(NodePath.join(profile, "ready"), "utf8")).toBe("");
});

it("does not expose native key diagnostics or mark failed setup ready", () => {
  const { profile, run } = fixture();
  const result = run("--init", "invalid-secret");
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain("invalid-secret");
  expect(() => NodeFS.readFileSync(NodePath.join(profile, "ready"))).toThrow();
});

it("imports and validates existing native credentials without changing the global CLI or tracing preferences", () => {
  const { directory, profile, run, source } = fixture();
  expect(run("--init").status).toBe(0);
  NodeFS.appendFileSync(
    source,
    '\ndef validate_gateway_credentials(*args):\n    raise RuntimeError("GUI gateway probe must not run")\n',
  );
  const data = JSON.parse(
    NodeFS.readFileSync(NodePath.join(profile, ".claude/settings.json"), "utf8"),
  );
  const certificate = NodePath.join(directory, "global-ca.pem");
  NodeFS.copyFileSync(NodePath.join(profile, "ca.pem"), certificate);
  data.env.NODE_EXTRA_CA_CERTS = certificate;
  data.env.CC_LANGSMITH_API_KEY = "fixture-tracing-secret";
  data.env.TRACE_TO_LANGSMITH = "true";
  data.env.LANGSMITH_HIDE_INPUTS = "false";
  data.env.LANGSMITH_HIDE_OUTPUTS = "false";
  data.hooks = { unrelated: "do not import" };
  const nativeClaudeDir = NodePath.join(directory, "custom-claude-home");
  NodeFS.mkdirSync(nativeClaudeDir);
  const original = NodePath.join(nativeClaudeDir, "settings.json");
  const contents = JSON.stringify(data);
  NodeFS.writeFileSync(original, contents);
  NodeFS.rmSync(profile, { recursive: true });
  const result = run("adopt", "fixture-secret", { ELYSIA_NATIVE_CLAUDE_DIR: nativeClaudeDir });
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).not.toContain("fixture-tracing-secret");
  expect(NodeFS.readFileSync(original, "utf8")).toBe(contents);
  const imported = JSON.parse(
    NodeFS.readFileSync(NodePath.join(profile, ".claude/settings.json"), "utf8"),
  );
  expect(imported).toMatchObject({
    model: data.model,
    allowed_models: data.allowed_models,
    env: {
      CC_LANGSMITH_API_KEY: "fixture-tracing-secret",
      LANGSMITH_HIDE_INPUTS: "false",
      LANGSMITH_HIDE_OUTPUTS: "false",
      NODE_EXTRA_CA_CERTS: NodePath.join(profile, "ca.pem"),
    },
  });
  expect(imported.hooks).toBeUndefined();
  expect(NodeFS.statSync(NodePath.join(profile, ".claude/settings.json")).mode & 0o777).toBe(0o600);
  expect(run("validate").status).toBe(0);
  NodeFS.rmSync(NodePath.join(profile, ".claude/plugins/installed_plugins.json"));
  expect(run("validate").stderr).toContain("ELYSIA_ERROR:tracing");
  expect(
    JSON.parse(NodeFS.readFileSync(NodePath.join(profile, ".claude/settings.json"), "utf8")).env
      .TRACE_TO_LANGSMITH,
  ).toBe("true");
  NodeFS.writeFileSync(NodePath.join(profile, "disconnected"), "");
  expect(run("adopt").status).toBe(1);
});

it("keeps incomplete CLI configuration and invalid certificates out of the workspace", () => {
  const { directory, profile, run } = fixture();
  NodeFS.mkdirSync(NodePath.join(directory, ".claude"));
  const original = NodePath.join(directory, ".claude/settings.json");
  NodeFS.writeFileSync(original, "{}");
  expect(run("adopt").stderr).toContain("ELYSIA_ERROR:credentials");
  expect(NodeFS.existsSync(NodePath.join(profile, "ready"))).toBe(false);
  expect(run("--init").status).toBe(0);
  NodeFS.writeFileSync(NodePath.join(profile, "ca.pem"), "invalid certificate");
  const result = run("validate");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("ELYSIA_ERROR:tls");
  expect(result.stdout + result.stderr).not.toContain("fixture-secret");
});

it("updates its managed copy and preserves profile isolation across native re-exec", () => {
  const { source, profile, run } = fixture();
  expect(run("--init").status).toBe(0);
  const before = JSON.parse(NodeFS.readFileSync(NodePath.join(profile, "record.json"), "utf8"));
  expect(run("--update").status).toBe(0);
  expect(
    JSON.parse(NodeFS.readFileSync(NodePath.join(profile, "record.json"), "utf8")),
  ).toMatchObject({
    home: profile,
    label: before.label,
    version: "0.3.9",
  });
  expect(NodeFS.readFileSync(source, "utf8")).toBe(nativeFixture);
});

it("quotes the resolved Windows Claude path while retaining native tracing arguments", () => {
  const { source, profile, run } = fixture();
  NodeFS.writeFileSync(
    source,
    nativeFixture +
      String.raw`
IS_MAC, IS_WINDOWS = False, True
claude_path = r"C:\Users\Declan Cowen\.local\bin\claude.cmd"
shutil.which = lambda name: claude_path if name == "claude.cmd" else None
commands = []
def fake_run(command, *args, **kwargs):
    commands.append(command)
    return subprocess.CompletedProcess(command, 0)
subprocess.run = fake_run
def main():
    arguments = " plugin install langsmith-tracing@langsmith-claude-code-plugins --scope user"
    subprocess.run(claude_path + arguments, shell=True)
    subprocess.run(claude_path + ".other" + arguments, shell=True)
    subprocess.run("claude --version", shell=True)
    subprocess.run([claude_path, "--version"])
    (HOME / "commands.json").write_text(json.dumps(commands))
`,
  );
  const result = run("--deploy-commands");
  expect(result.status, result.stderr).toBe(0);
  const claude = String.raw`C:\Users\Declan Cowen\.local\bin\claude.cmd`;
  const args = " plugin install langsmith-tracing@langsmith-claude-code-plugins --scope user";
  expect(JSON.parse(NodeFS.readFileSync(NodePath.join(profile, "commands.json"), "utf8"))).toEqual([
    `"${claude}"${args}`,
    `${claude}.other${args}`,
    "claude --version",
    [claude, "--version"],
  ]);
});

it("keeps Windows autostart in its profile and refuses to kill a foreign port owner", () => {
  const { source, profile, run } = fixture();
  NodeFS.writeFileSync(
    source,
    nativeFixture +
      String.raw`
IS_MAC, IS_WINDOWS = False, True
LAUNCHER_PY = ELYSIA_DIR / "compression-proxy.py"
original_main = main
def _register_proxy_autostart_windows(*args, **kwargs):
    (HOME / "startup.json").write_text(json.dumps({"script": __file__, "task": TASK_NAME}))
STARTUP_FOLDER = HOME / "AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup"
def fake_run(command, *args, **kwargs):
    if command[0] == "powershell.exe":
        return subprocess.CompletedProcess(command, 0, stdout="python another-app.py")
    raise AssertionError("A foreign process must never reach taskkill")
subprocess.run = fake_run
def main():
    original_main()
    _register_proxy_autostart_windows(sys.executable, 8787)
    try:
        subprocess.run(["taskkill", "/PID", "99999", "/F"])
        raise AssertionError("Expected refusal")
    except RuntimeError:
        (HOME / "foreign-process-preserved").touch()
`,
  );
  expect(run("--init").status).toBe(0);
  expect(
    JSON.parse(NodeFS.readFileSync(NodePath.join(profile, "startup.json"), "utf8")),
  ).toMatchObject({
    script: NodePath.join(profile, "elysia-autostart.py"),
  });
  expect(NodeFS.readFileSync(NodePath.join(profile, "elysia-autostart.py"), "utf8")).toContain(
    NodePath.join(profile, "elysia-bridge.py"),
  );
  expect(NodeFS.existsSync(NodePath.join(profile, "foreign-process-preserved"))).toBe(true);
});

it("registers and removes only its Windows Startup fallback in the real user folder", () => {
  const { source, profile, directory, run } = fixture();
  const appData = NodePath.join(directory, "Real AppData", "Roaming");
  const startup = NodePath.join(appData, "Microsoft/Windows/Start Menu/Programs/Startup");
  NodeFS.mkdirSync(startup, { recursive: true });
  const unrelated = ["elysia-compression.pyw", "ElysiaCompressionProxy-foreign.pyw"];
  for (const file of unrelated) NodeFS.writeFileSync(NodePath.join(startup, file), "unrelated");
  NodeFS.writeFileSync(
    source,
    nativeFixture +
      String.raw`
IS_MAC, IS_WINDOWS = False, True
STARTUP_FOLDER = HOME / "AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup"
def _register_proxy_autostart_windows(*args, **kwargs):
    STARTUP_FOLDER.mkdir(parents=True, exist_ok=True)
    (STARTUP_FOLDER / "elysia-compression.pyw").write_text(
        'import subprocess\nsubprocess.Popen([r"' + sys.executable + '", r"' + __file__ + '", "--compression-enable"])\n')
def _stop_proxy_windows(*args, **kwargs):
    for name in ("elysia-compression.pyw", "elysia-compression.py", "elysia-compression.bat"):
        (STARTUP_FOLDER / name).unlink(missing_ok=True)
def main():
    if "--compression-enable" in sys.argv:
        _register_proxy_autostart_windows(sys.executable, 8787)
    elif "--compression-disable" in sys.argv:
        _stop_proxy_windows()
`,
  );
  const registered = run("--compression-enable", "", { APPDATA: appData });
  expect(registered.status, registered.stderr).toBe(0);
  const ownFile = NodeFS.readdirSync(startup).find((file) => !unrelated.includes(file));
  expect(ownFile).toMatch(/^ElysiaCompressionProxy-[a-f0-9]{16}\.pyw$/);
  expect(NodeFS.readFileSync(NodePath.join(startup, ownFile!), "utf8")).toContain(
    NodePath.join(profile, "elysia-autostart.py"),
  );
  expect(
    NodeFS.readdirSync(
      NodePath.join(profile, "AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup"),
    ),
  ).toEqual([]);
  const stopped = run("--compression-disable", "", { APPDATA: appData });
  expect(stopped.status, stopped.stderr).toBe(0);
  expect(NodeFS.readdirSync(startup).sort()).toEqual(unrelated.toSorted());
  for (const file of unrelated)
    expect(NodeFS.readFileSync(NodePath.join(startup, file), "utf8")).toBe("unrelated");
});

it("keeps the slash command and scoped CLI on the active compression port", () => {
  const { profile, run, directory } = fixture();
  expect(run("--init").status).toBe(0);
  const port = JSON.parse(
    NodeFS.readFileSync(NodePath.join(profile, ".elysia", "compression.json"), "utf8"),
  ).port;
  expect(
    NodeFS.readFileSync(
      NodePath.join(profile, ".claude", "commands", "elysia-compression.md"),
      "utf8",
    ),
  ).toContain(`http://localhost:${port}/dashboard`);
  const stats = NodeChildProcess.spawnSync(
    NodePath.join(profile, "bin", "elysia-code"),
    ["--compression-stats"],
    { env: { ...process.env, HOME: directory }, encoding: "utf8" },
  );
  expect(stats.status).toBe(0);
  expect(JSON.parse(stats.stdout)).toEqual({ home: profile, port });
});

it("preserves the owned port when native compression is disabled", () => {
  const { profile, run } = fixture();
  expect(run("--init").status).toBe(0);
  const statePath = NodePath.join(profile, ".elysia", "compression.json");
  NodeFS.writeFileSync(statePath, JSON.stringify({ enabled: true, port: 49876 }));
  expect(run("--compression-disable").status).toBe(0);
  expect(JSON.parse(NodeFS.readFileSync(statePath, "utf8"))).toEqual({
    enabled: false,
    port: 49876,
  });
});

for (const platform of ["mac", "windows"] as const) {
  it(`${platform}: restores a stopped enabled native compression service without changing routing or tracing`, () => {
    const { source, profile, run } = fixture();
    NodeFS.appendFileSync(
      source,
      String.raw`
IS_MAC, IS_WINDOWS = ${platform === "mac" ? "True, False" : "False, True"}
def _find_headroom():
    return "fixture-headroom"
def _load_credentials_from_settings():
    return "fixture-secret", "config"
def _headroom_env(api_key, config_id):
    return {"ANTHROPIC_API_KEY": api_key, "config": config_id}
def _install_launchd_agent(headroom, env, port, silent=False):
    assert headroom == "fixture-headroom" and silent
    _start_proxy_windows(env, port, silent)
def _start_proxy_windows(env, port, silent=False):
    assert env == {"ANTHROPIC_API_KEY": "fixture-secret", "config": "config"} and silent
    (HOME / "restored.json").write_text(json.dumps({"port": port, "home": str(HOME), "service": PLIST_LABEL if IS_MAC else TASK_NAME}))
def enable_compression():
    raise AssertionError("Restoring must not reset or reinstall the proxy")
`,
    );
    expect(run("--init").status).toBe(0);
    const statePath = NodePath.join(profile, ".elysia/compression.json");
    const state = JSON.parse(NodeFS.readFileSync(statePath, "utf8"));
    NodeFS.writeFileSync(statePath, JSON.stringify({ ...state, enabled: true }));
    const settingsPath = NodePath.join(profile, ".claude/settings.json");
    const settings = NodeFS.readFileSync(settingsPath, "utf8");
    const restored = run("restore-compression");
    expect(restored.status, restored.stderr).toBe(0);
    expect(restored.stdout + restored.stderr).not.toContain("fixture-secret");
    expect(
      JSON.parse(NodeFS.readFileSync(NodePath.join(profile, "restored.json"), "utf8")),
    ).toMatchObject({
      port: state.port,
      home: profile,
    });
    expect(NodeFS.readFileSync(settingsPath, "utf8")).toBe(settings);
    expect(JSON.parse(NodeFS.readFileSync(statePath, "utf8"))).toEqual({ ...state, enabled: true });
  });
}

for (const status of [200, 503] as const) {
  it(`leaves a listening compression port untouched when /health returns ${status}`, async () => {
    const { profile, run } = fixture();
    expect(run("--init").status).toBe(0);
    const server = NodeChildProcess.spawn("python3", [
      "-u",
      "-c",
      String.raw`
from http.server import BaseHTTPRequestHandler, HTTPServer
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        assert self.path == "/health" and not self.headers.get("Authorization")
        self.send_response(${status})
        self.end_headers()
    def log_message(self, *args):
        pass
server = HTTPServer(("127.0.0.1", 0), Handler)
print(server.server_port, flush=True)
server.serve_forever()
`,
    ]);
    try {
      const [output] = await NodeEvents.EventEmitter.once(server.stdout!, "data");
      const port = Number(String(output).trim());
      const statePath = NodePath.join(profile, ".elysia/compression.json");
      const state = JSON.stringify({ enabled: true, port });
      NodeFS.writeFileSync(statePath, state);
      const settingsPath = NodePath.join(profile, ".claude/settings.json");
      const settings = NodeFS.readFileSync(settingsPath, "utf8");
      const result = run("restore-compression");
      expect(result.status, result.stderr).toBe(status === 200 ? 0 : 1);
      if (status === 503) expect(result.stderr).toContain("ELYSIA_ERROR:compression");
      expect(NodeFS.readFileSync(statePath, "utf8")).toBe(state);
      expect(NodeFS.readFileSync(settingsPath, "utf8")).toBe(settings);
      expect(server.exitCode).toBeNull();
    } finally {
      const exited = NodeEvents.EventEmitter.once(server, "exit");
      server.kill();
      await exited;
    }
  });
}

it("keeps disabled compression disabled and rejects invalid ports without starting a proxy", () => {
  const { profile, run } = fixture();
  expect(run("--init").status).toBe(0);
  const statePath = NodePath.join(profile, ".elysia/compression.json");
  const state = NodeFS.readFileSync(statePath, "utf8");
  expect(run("restore-compression").status).toBe(0);
  expect(NodeFS.readFileSync(statePath, "utf8")).toBe(state);
  NodeFS.writeFileSync(statePath, JSON.stringify({ enabled: true, port: "8787" }));
  const invalid = run("restore-compression");
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("ELYSIA_ERROR:compression");
});

it("protects coding tools while preserving native commands and tracing credentials", async () => {
  const { profile, run } = fixture();
  expect(run("--init").status).toBe(0);
  const environment = {
    ...process.env,
    ELYSIA_PROFILE_ROOT: profile,
    ELYSIA_ACTIVE_MODEL: "kimi-k3",
    ANTHROPIC_AUTH_TOKEN: "fixture-secret",
    CC_LANGSMITH_API_KEY: "trace-secret",
    TRACE_TO_LANGSMITH: "true",
  };
  const policy = elysiaAgentProtection(environment);
  expect(policy.sandbox).toMatchObject({
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
  });
  expect(policy.sandbox?.credentials?.envVars).toContainEqual({
    name: "ANTHROPIC_AUTH_TOKEN",
    mode: "deny",
  });
  expect(environment.CC_LANGSMITH_API_KEY).toBe("trace-secret");
  expect(environment.TRACE_TO_LANGSMITH).toBe("true");
  const hook = policy.hooks!.PreToolUse![0]!.hooks[0]!;
  const call = (tool_name: string, tool_input: Record<string, unknown>) =>
    hook(
      {
        hook_event_name: "PreToolUse",
        session_id: "fixture-session",
        transcript_path: "/tmp/fixture-transcript",
        cwd: profile,
        tool_name,
        tool_input,
        tool_use_id: "fixture-tool",
      },
      undefined,
      { signal: new AbortController().signal },
    );
  expect(
    await call("Read", { file_path: NodePath.join(profile, ".claude", "settings.json") }),
  ).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
  expect(
    await call("Write", { file_path: NodePath.join(profile, ".elysia", "new-secret.json") }),
  ).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
  expect(
    await call("Bash", { command: "npm test", dangerouslyDisableSandbox: true }),
  ).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
  const inspected = await call("Bash", { command: "elysia-code --config" });
  expect(inspected).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } });
  const output = JSON.stringify(inspected);
  expect(output).toContain("Thread model: kimi-k3");
  expect(output).toContain("****");
  expect(output).not.toContain("fixture-secret");
  expect(output).not.toContain("trace-secret");
  expect(await call("Bash", { command: "elysia-code --config; env" })).toEqual({});
});

it("runs native user skills without exposing profile credentials or replacing Elysia commands", async () => {
  const { directory, profile, run } = fixture();
  expect(run("--init").status).toBe(0);
  const original = NodePath.join(directory, "native-claude");
  NodeFS.mkdirSync(NodePath.join(original, "skills", "reports"), { recursive: true });
  NodeFS.mkdirSync(NodePath.join(original, "commands", "team"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(original, "skills", "reports", "SKILL.md"),
    "Create a report.",
  );
  NodeFS.writeFileSync(NodePath.join(original, "commands", "brief.md"), "Create a brief.");
  NodeFS.writeFileSync(NodePath.join(original, "commands", "team", "plan.md"), "Create a plan.");
  NodeFS.writeFileSync(NodePath.join(original, "commands", "elysia-compression.md"), "wrong port");
  NodeFS.writeFileSync(
    NodePath.join(original, "settings.json"),
    JSON.stringify({
      skillOverrides: { reports: "off" },
      hooks: { private: "do not import" },
      env: { TOKEN: "private" },
    }),
  );
  const managed = NodePath.join(profile, ".claude");
  await syncElysiaExtensions(original, managed);
  expect(NodeFS.readFileSync(NodePath.join(managed, "skills", "reports", "SKILL.md"), "utf8")).toBe(
    "Create a report.",
  );
  expect(NodeFS.readFileSync(NodePath.join(managed, "commands", "team", "plan.md"), "utf8")).toBe(
    "Create a plan.",
  );
  expect(
    NodeFS.readFileSync(NodePath.join(managed, "commands", "elysia-compression.md"), "utf8"),
  ).not.toBe("wrong port");
  const settings = JSON.parse(NodeFS.readFileSync(NodePath.join(managed, "settings.json"), "utf8"));
  expect(settings.skillOverrides).toEqual({ reports: "off" });
  expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe("fixture-secret");
  expect(settings.hooks).toBeUndefined();
  NodeFS.writeFileSync(NodePath.join(original, "commands", "brief.md"), "Updated brief.");
  await syncElysiaExtensions(original, managed);
  expect(NodeFS.readFileSync(NodePath.join(managed, "commands", "brief.md"), "utf8")).toBe(
    "Updated brief.",
  );

  const policy = elysiaAgentProtection({
    ELYSIA_PROFILE_ROOT: profile,
    ELYSIA_NATIVE_CLAUDE_DIR: original,
  });
  const hook = policy.hooks!.PreToolUse![0]!.hooks[0]!;
  const read = (file_path: string) =>
    hook(
      {
        hook_event_name: "PreToolUse",
        session_id: "fixture",
        transcript_path: "/tmp/fixture",
        cwd: profile,
        tool_name: "Read",
        tool_input: { file_path },
        tool_use_id: "fixture",
      },
      undefined,
      { signal: new AbortController().signal },
    );
  expect(await read(NodePath.join(managed, "skills", "reports", "SKILL.md"))).toEqual({});
  expect(await read(NodePath.join(managed, "commands", "brief.md"))).toEqual({});
  expect(await read(NodePath.join(managed, "settings.json"))).toMatchObject({
    hookSpecificOutput: { permissionDecision: "deny" },
  });
  expect(await read(NodePath.join(original, "settings.json"))).toMatchObject({
    hookSpecificOutput: { permissionDecision: "deny" },
  });
});
