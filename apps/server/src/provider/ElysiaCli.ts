// @effect-diagnostics nodeBuiltinImport:off - native directory junctions keep user skills available on Windows.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { HostProcessArchitecture, HostProcessPlatform } from "@elysiatools/shared/hostProcess";
import { resolveSpawnCommand } from "@elysiatools/shared/shell";
import { compareSemverVersions } from "@elysiatools/shared/semver";
import {
  type ClaudeSettings,
  ElysiaAccountUsageSnapshot,
  ProviderDriverKind,
  type ProviderInstanceId,
  ProviderSetupError,
} from "@elysiatools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { expandHomePath } from "../pathExpansion.ts";
import { spawnAndCollect } from "./providerSnapshot.ts";
import { makeProviderMaintenanceCapabilities } from "./providerMaintenance.ts";
import { resolveClaudeHomePath } from "./Drivers/ClaudeHome.ts";

const decodeAccountUsage = Schema.decodeUnknownOption(ElysiaAccountUsageSnapshot);

export function parseElysiaAccountUsage(output: string): ElysiaAccountUsageSnapshot {
  // Read only the native --config Usage section; never return profile IDs or credentials.
  const usage = output.split(/^Usage\s*$/m)[1]?.split(/^Compression\s*$/m)[0];
  if (!usage) return { status: "unavailable", reason: "cli-unavailable" };
  const amounts = /^Used\s*:\s*\$([\d.]+)\s*\/\s*\$([\d.]+)\s*$/m.exec(usage);
  const field = (name: string) => {
    const value = new RegExp(`^${name}\\s*:\\s*(.*)$`, "m").exec(usage)?.[1]?.trim();
    return !value || value === "-" || value === "None" ? null : value;
  };
  if (!amounts) return { status: "unavailable", reason: "invalid-data" };
  const result = decodeAccountUsage({
    status: "available",
    usedUsd: Number(amounts[1]),
    limitUsd: Number(amounts[2]),
    accountStatus: field("Status"),
    resetPeriod: field("Resets"),
    expiresOn: field("Expires"),
  });
  return result._tag === "Some" ? result.value : { status: "unavailable", reason: "invalid-data" };
}

// ponytail: 0.3.8 has global paths rather than a profile flag. Import the actual
// package in an isolated home; replace this bridge when the CLI adds --home.
export const ELYSIA_CLI_BRIDGE = String.raw`
import hashlib, http.client, importlib.util, io, json, os, re, shlex, shutil, socket, ssl, subprocess, sys, tempfile, urllib.error, urllib.request, zipfile
from pathlib import Path

source, root = sys.argv[1:3]
operation = sys.argv[3] if len(sys.argv) > 3 else "--help"
real_home = Path(os.environ.get("ELYSIA_REAL_HOME", str(Path.home())))
real_appdata = Path(os.environ.get("APPDATA", str(real_home / "AppData/Roaming")))
os.environ["ELYSIA_REAL_HOME"] = str(real_home)
root = Path(root)
os.umask(0o077)
root.mkdir(parents=True, exist_ok=True)
root.chmod(0o700)
script = root / "elysia-code.py"
if operation == "bootstrap" and not Path(source).is_file() and not script.is_file():
    # OS curl uses the system certificate store. Never bypass TLS verification.
    # The private temporary folder is removed on success and failure alike.
    with tempfile.TemporaryDirectory(prefix="setup-", dir=root) as temporary:
        setup_dir = Path(temporary)
        archive_path = setup_dir / "package.zip"
        try:
            result = subprocess.run(["curl.exe" if os.name == "nt" else "curl",
                "--fail", "--silent", "--show-error", "--location",
                "--proto", "=https", "--proto-redir", "=https",
                "--connect-timeout", "15", "--max-time", "120", "--max-filesize", "33554432",
                "--output", str(archive_path),
                "https://pilots.ai.informa.com/elysia-code/releases/elysia-code-latest.zip"],
                capture_output=True, timeout=125)
            if result.returncode != 0:
                raise RuntimeError("Package download failed")
        except BaseException:
            print("ELYSIA_ERROR:download-cli", file=sys.stderr)
            sys.exit(1)
        try:
            required = {"elysia-code.py", "setup-mac.sh", "setup-windows.cmd"}
            entries = {}
            with zipfile.ZipFile(archive_path) as archive:
                for entry in archive.infolist():
                    parts = Path(entry.filename.replace("\\", "/")).parts
                    if ".." in parts or entry.filename.startswith(("/", "\\")) or ":" in entry.filename:
                        raise ValueError("Unsafe package path")
                    name = parts[-1] if parts else ""
                    if name not in required or entry.is_dir():
                        continue
                    if name in entries or entry.file_size > 8 * 1024 * 1024 or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                        raise ValueError("Invalid package file")
                    entries[name] = entry
                if set(entries) != required:
                    raise ValueError("Incomplete package")
                for name, entry in entries.items():
                    (setup_dir / name).write_bytes(archive.read(entry))
        except BaseException:
            print("ELYSIA_ERROR:package-invalid", file=sys.stderr)
            sys.exit(1)
        setup = setup_dir / ("setup-windows.cmd" if os.name == "nt" else "setup-mac.sh")
        setup.chmod(0o700)
        command = ["cmd.exe", "/d", "/c", str(setup)] if os.name == "nt" else ["/bin/bash", str(setup)]
        try:
            result = subprocess.run(command, cwd=setup_dir, capture_output=True, timeout=180)
            installed_source = real_home / ".local/bin/elysia-code.py"
            if result.returncode != 0 or not installed_source.is_file():
                raise RuntimeError("Native installer failed")
            source = str(installed_source)
        except BaseException:
            print("ELYSIA_ERROR:install-cli", file=sys.stderr)
            sys.exit(1)
if os.name == "nt":
    # Native Windows setup writes company configuration to the user environment.
    # Read it without requiring an app restart or retaining extracted setup files.
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            for index in range(winreg.QueryInfoKey(key)[1]):
                name, value, _ = winreg.EnumValue(key, index)
                if name.startswith("ELYSIA_") and isinstance(value, str):
                    os.environ.setdefault(name, value)
    except OSError:
        pass
for config in [real_home / ".zshrc", real_home / ".bashrc", real_home / ".elysia/config", Path(source).parent / "setup-mac.sh", Path(source).parent / "setup-windows.cmd", root / "setup-mac.sh", root / "setup-windows.cmd"]:
    if not config.is_file():
        continue
    for line in config.read_text(encoding="utf-8", errors="replace").splitlines():
        assignment = line.strip().removeprefix("export ").removeprefix("set ")
        if assignment.startswith('"') and assignment.endswith('"'):
            assignment = assignment[1:-1]
        match = re.match(r'(ELYSIA_[A-Z_]+)=(.*)$', assignment)
        if match:
            try:
                value = shlex.split(match[2])[0]
                if "$" not in value:
                    os.environ.setdefault(match[1], value)
            except (ValueError, IndexError):
                pass
os.environ["HOME"] = os.environ["USERPROFILE"] = str(root)
os.environ["CLAUDE_CONFIG_DIR"] = str(root / ".claude")
if os.name == "nt":
    # Keep native plugin caches and fallback staging paths profile-owned.
    os.environ["APPDATA"] = str(root / "AppData/Roaming")
    os.environ["LOCALAPPDATA"] = str(root / "AppData/Local")
bridge = root / "elysia-bridge.py"
bridge_source = os.environ.get("ELYSIA_CLI_BRIDGE")
if not bridge_source:
    bridge_source = Path(__file__).read_text()
    os.environ["ELYSIA_CLI_BRIDGE"] = bridge_source
bridge.write_text(bridge_source)
bin_dir = root / "bin"
bin_dir.mkdir(exist_ok=True)
launcher = bin_dir / ("elysia-code.cmd" if os.name == "nt" else "elysia-code")
command = [sys.executable, str(bridge), source, str(root)]
if os.name == "nt":
    launcher.write_text("@echo off\n" + subprocess.list2cmdline(command) + " %*\n")
else:
    launcher.write_text("#!/bin/sh\nexec " + shlex.join(command) + ' "$@"\n')
    launcher.chmod(0o700)
if not script.exists():
    script.write_bytes(Path(source).read_bytes())
if operation == "bootstrap":
    print("Elysia CLI installed")
    sys.exit(0)
spec = importlib.util.spec_from_file_location("elysia_native", script)
native = importlib.util.module_from_spec(spec)
exec(compile(script.read_bytes(), str(script), "exec"), native.__dict__)
native.MCP_FILE = root / ".claude/.claude.json"
service_id = hashlib.sha256(str(root).encode()).hexdigest()[:16]
native.PLIST_LABEL = "com.informa.elysia-compression." + service_id
native.PLIST_PATH = real_home / "Library/LaunchAgents" / (native.PLIST_LABEL + ".plist")
native.TASK_NAME = "ElysiaCompressionProxy-" + service_id
native.REGISTRY_VALUE = native.TASK_NAME
if native.IS_WINDOWS and hasattr(native, "_register_proxy_autostart_windows"):
    startup = root / "elysia-autostart.py"
    startup_file = real_appdata / "Microsoft/Windows/Start Menu/Programs/Startup" / (native.TASK_NAME + ".pyw")
    startup.write_text("import os, sys\n"
        + "os.environ['ELYSIA_REAL_HOME'] = " + repr(str(real_home)) + "\n"
        + "os.execv(sys.executable, " + repr([sys.executable, str(bridge), source, str(root), "--compression-enable"]) + ")\n")
    register_autostart = native._register_proxy_autostart_windows
    def register(*args, **kwargs):
        original_file = native.__file__
        try:
            native.__file__ = str(startup)
            result = register_autostart(*args, **kwargs)
            # Native hardcodes the fallback filename; move only our staged file.
            fallback = native.STARTUP_FOLDER / "elysia-compression.pyw"
            if fallback.is_file():
                startup_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(fallback), str(startup_file))
            return result
        finally:
            native.__file__ = original_file
    native._register_proxy_autostart_windows = register
    if hasattr(native, "_stop_proxy_windows"):
        stop_autostart = native._stop_proxy_windows
        def stop(*args, **kwargs):
            try:
                return stop_autostart(*args, **kwargs)
            finally:
                startup_file.unlink(missing_ok=True)
        native._stop_proxy_windows = stop
# The native command embeds its default port. Scope it to this profile too.
if hasattr(native, "deploy_elysia_compression_command"):
    deploy_command = native.deploy_elysia_compression_command
    def deploy():
        deploy_command()
        file = native.CLAUDE_DIR / "commands/elysia-compression.md"
        port = native._read_compression_state().get("port", 8787)
        file.write_text(file.read_text().replace("localhost:8787", "localhost:" + str(port)))
    native.deploy_elysia_compression_command = deploy
if operation == "latest":
    context = ssl.create_default_context(cafile=str(native.CERT_FILE) if native.CERT_FILE.exists() else None)
    cache_file = root / ".elysia/update-version.json"
    try:
        cache = json.loads(cache_file.read_text())
        if not isinstance(cache, dict) or not re.fullmatch(r"\d+\.\d+\.\d+", cache.get("version", "")):
            cache = {}
    except (OSError, ValueError):
        cache = {}
    headers = {}
    if cache.get("etag"):
        headers["If-None-Match"] = cache["etag"]
    elif cache.get("modified"):
        headers["If-Modified-Since"] = cache["modified"]
    try:
        with urllib.request.urlopen(urllib.request.Request(native.UPDATE_ZIP_URL, headers=headers), context=context, timeout=15) as response:
            with zipfile.ZipFile(io.BytesIO(response.read(32 * 1024 * 1024 + 1))) as archive:
                name = next(n for n in archive.namelist() if Path(n).name == "elysia-code.py")
                if archive.getinfo(name).file_size > 8 * 1024 * 1024:
                    raise ValueError("Invalid CLI file size")
                version = re.search(rb'CLI_VERSION\s*=\s*"(\d+\.\d+\.\d+)"', archive.read(name))[1].decode()
            cache = {"version": version, "etag": response.headers.get("ETag"), "modified": response.headers.get("Last-Modified")}
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps(cache))
    except urllib.error.HTTPError as error:
        if error.code != 304 or not cache.get("version"):
            raise
    print(cache["version"])
    sys.exit(0)

# Native update re-executes --finish-update. Preserve the managed profile and
# service identity in that child too, using the newly downloaded native code.
original_run = subprocess.run
post_update_failed = False
def run(command, *args, **kwargs):
    global post_update_failed
    finishing_update = isinstance(command, list) and "--finish-update" in command
    if native.IS_WINDOWS and isinstance(command, str) and kwargs.get("shell"):
        claude = shutil.which("claude.cmd") or shutil.which("claude")
        if claude and (command == claude or command.startswith(claude + " ")):
            command = subprocess.list2cmdline([claude]) + command[len(claude):]
    if finishing_update:
        command = [sys.executable, "-c", os.environ["ELYSIA_CLI_BRIDGE"], source, str(root), "--finish-update"] + command[3:]
    if isinstance(command, list) and command[:2] == ["launchctl", "bootout"]:
        command = ["launchctl", "bootout", "gui/" + str(os.getuid()) + "/" + native.PLIST_LABEL]
    if native.IS_WINDOWS and isinstance(command, list) and command[:2] == ["taskkill", "/PID"]:
        pid = command[2]
        if not str(pid).isdigit():
            raise RuntimeError("Invalid compression process")
        owner = original_run(["powershell.exe", "-NoProfile", "-Command",
            "(Get-CimInstance Win32_Process -Filter 'ProcessId=" + str(pid) + "').CommandLine"],
            capture_output=True, text=True, timeout=10)
        if owner.returncode != 0 or str(native.LAUNCHER_PY).casefold() not in owner.stdout.casefold():
            raise RuntimeError("Compression port belongs to another process")
    try:
        result = original_run(command, *args, **kwargs)
    except BaseException:
        if finishing_update:
            post_update_failed = True
        raise
    if finishing_update and result.returncode != 0:
        post_update_failed = True
    return result
subprocess.run = run
sys.argv = [str(script), operation] + sys.argv[4:]
validation_error = "gateway"
warnings = set()
original_urlopen = urllib.request.urlopen
def urlopen(*args, **kwargs):
    global validation_error
    try:
        return original_urlopen(*args, **kwargs)
    except urllib.error.HTTPError as error:
        validation_error = "credentials" if error.code in (401, 403) else "gateway"
        raise
    except (ssl.SSLError, urllib.error.URLError) as error:
        validation_error = "tls" if isinstance(error, ssl.SSLError) or isinstance(getattr(error, "reason", None), ssl.SSLError) else "gateway"
        raise
urllib.request.urlopen = urlopen

def validate_profile():
    global validation_error
    validation_error = "credentials"
    key, config_id = native._load_credentials_from_settings()
    if not key or not config_id:
        raise ValueError("No native Elysia sign-in")
    # Read the CLI's saved sign-in; prerequisite/addon setup is not authentication.

def restore_compression():
    global validation_error
    validation_error = "compression"
    state = native._read_compression_state()
    if state.get("enabled") is not True:
        return
    port = state.get("port")
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ValueError("Invalid compression port")
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("GET", "/health")
        if connection.getresponse().status != 200:
            raise RuntimeError("Compression port is occupied")
        return
    except ConnectionRefusedError:
        pass
    finally:
        connection.close()
    # A failed health response or occupied port must never restart another service.
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", port))
    native._init_globals()
    headroom = native._find_headroom()
    api_key, config_id = native._load_credentials_from_settings()
    if not headroom or not api_key or not config_id:
        raise ValueError("Compression setup unavailable")
    env = native._headroom_env(api_key, config_id)
    # --compression-enable reinstalls dependencies and resets a healthy proxy.
    # Restore its existing service instead, preserving native routing and stats.
    if native.IS_MAC:
        native._install_launchd_agent(headroom, env, port, silent=True)
    elif native.IS_WINDOWS:
        native._start_proxy_windows(env, port, silent=True)
    else:
        raise RuntimeError("Unsupported compression service")
    if hasattr(native, "LAUNCHER_PY") and native.LAUNCHER_PY.is_file():
        native.LAUNCHER_PY.chmod(0o600)

def configure_native_addons():
    if not hasattr(native, "install_shunt_plugin"):
        return
    native._init_globals()
    settings_file = native.CLAUDE_DIR / "settings.json"
    settings = json.loads(settings_file.read_text())
    for name in ["SHUNT_BASE_URL", "SHUNT_READ_MODEL", "SHUNT_WRITE_MODEL"]:
        settings["env"].setdefault(name, getattr(native, name))
    settings_file.write_text(json.dumps(settings, indent=2) + "\n")
    native.write_mcp(native._load_credentials_from_settings()[0])
    native.install_shunt_plugin()

def adopt_profile():
    global validation_error
    validation_error = "credentials"
    if (root / "disconnected").exists():
        raise ValueError("Elysia disconnected")
    original = Path(os.environ.get("ELYSIA_NATIVE_CLAUDE_DIR", str(real_home / ".claude"))) / "settings.json"
    data = json.loads(original.read_text())
    # Import only native Elysia configuration, never Claude OAuth/history or
    # unrelated hooks and MCP providers from the user's global profile.
    data = {field: data[field] for field in ("env", "model", "allowed_models")}
    metadata = json.loads(data["env"]["CC_LANGSMITH_METADATA"])
    native.CLAUDE_DIR.mkdir(parents=True, exist_ok=True)
    (native.CLAUDE_DIR / "settings.json").write_text(json.dumps(data, indent=2) + "\n")
    validate_profile()
    native.ELYSIA_DIR.mkdir(parents=True, exist_ok=True)
    config = real_home / ".elysia/config"
    if config.is_file():
        shutil.copyfile(config, native.ELYSIA_DIR / "config")
    certificate_path = data["env"].get("NODE_EXTRA_CA_CERTS")
    if certificate_path and Path(certificate_path).is_file():
        shutil.copyfile(certificate_path, native.CERT_FILE)
        for name in ["SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"]:
            if data["env"].get(name) == certificate_path:
                data["env"][name] = str(native.CERT_FILE)
    validation_error = "configuration"
    native._init_globals()
    was_compressed = metadata.get("compression") == "enabled"
    data["env"]["ANTHROPIC_BASE_URL"] = native.GATEWAY_URL
    (native.CLAUDE_DIR / "settings.json").write_text(json.dumps(data, indent=2) + "\n")
    with socket.socket() as listener:
        try:
            listener.bind(("127.0.0.1", 8787))
        except OSError:
            listener.bind(("127.0.0.1", 0))
        native.COMPRESSION_STATE.write_text(json.dumps({"enabled": False, "port": listener.getsockname()[1]}))
    # Native plugin installation warnings must not revoke a valid company sign-in.
    validate_profile()
    for prepare in [native.install_langsmith_plugin, configure_native_addons,
                    native.deploy_claude_md, native.deploy_elysia_config_command,
                    native.deploy_elysia_model_command, native.deploy_elysia_compression_command]:
        try:
            prepare()
        except (Exception, SystemExit):
            warnings.add("addons")
    if was_compressed:
        settings_before = (native.CLAUDE_DIR / "settings.json").read_text()
        compression_before = native.COMPRESSION_STATE.read_text()
        try:
            if native.install_headroom():
                native.enable_compression()
            else:
                warnings.add("compression")
        except (Exception, SystemExit):
            (native.CLAUDE_DIR / "settings.json").write_text(settings_before)
            native.COMPRESSION_STATE.write_text(compression_before)
            warnings.add("compression")
    validate_profile()

if operation == "--init":
    if not (native.IS_MAC or native.IS_WINDOWS):
        sys.exit(2)
    (root / "ready").unlink(missing_ok=True)
    values = json.load(sys.stdin)
    for name in ["workspace-id", "config-id", "user-id", "api-key"]:
        sys.argv += ["--" + name, values[name.replace("-", "_")]]
    native.ELYSIA_DIR.mkdir(parents=True, exist_ok=True)
    if not native.COMPRESSION_STATE.exists():
        with socket.socket() as listener:
            try:
                listener.bind(("127.0.0.1", 8787))
            except OSError:
                listener.bind(("127.0.0.1", 0))
            native.COMPRESSION_STATE.write_text(json.dumps({"enabled": False, "port": listener.getsockname()[1]}))

# Native disable/autostart helpers otherwise reset or kill port 8787 even when
# this profile already selected another port.
if native.COMPRESSION_STATE.exists():
    native.COMPRESSION_PORT = native._read_compression_state().get("port", 8787)
    for name in ["_write_compression_state", "_kill_proxy_windows"]:
        if hasattr(native, name):
            getattr(native, name).__defaults__ = (native.COMPRESSION_PORT,)

# Native setup includes key fragments in diagnostics. Keep credentials and
# updater output private; read-only CLI commands retain their native output.
sensitive = operation in ["--init", "--update", "--finish-update", "adopt", "validate", "restore-compression"]
if sensitive:
    saved_out, saved_err = os.dup(1), os.dup(2)
    failure = None
    try:
        with open(os.devnull, "w") as sink:
            os.dup2(sink.fileno(), 1)
            os.dup2(sink.fileno(), 2)
            if operation == "adopt":
                adopt_profile()
            elif operation == "validate":
                validate_profile()
            elif operation == "restore-compression":
                restore_compression()
            else:
                native.main()
                if operation == "--update" and post_update_failed:
                    validation_error = "prerequisites"
                    raise RuntimeError("Native post-update setup failed")
                if operation == "--init":
                    validate_profile()
    except BaseException as error:
        failure = validation_error + ":" + type(error).__name__
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        os.dup2(saved_out, 1)
        os.dup2(saved_err, 2)
    if failure:
        print("ELYSIA_ERROR:" + failure, file=sys.stderr)
        sys.exit(1)
    for warning in sorted(warnings):
        print("ELYSIA_WARNING:" + warning, file=sys.stderr)
else:
    native.main()
if operation in ["--init", "adopt", "validate"]:
    (root / "ready").touch()
    (root / "disconnected").unlink(missing_ok=True)
if sensitive and operation not in ["validate", "restore-compression"]:
    for file in root.rglob("*"):
        if file.is_file() and not file.is_symlink() and "runtime" not in file.relative_to(root).parts:
            file.chmod(0o700 if file.stat().st_mode & 0o100 else 0o600)
if sensitive and native.PLIST_PATH.exists():
    native.PLIST_PATH.chmod(0o600)
if operation in ["--init", "--update", "--finish-update", "adopt"]:
    # Publish only after setup finishes; the updater replaces its script first.
    match = re.search(r'CLI_VERSION\s*=\s*"([^"]+)"', script.read_text())
    if not match:
        raise ValueError("Missing CLI version")
    staged = root / "configuration-version.tmp"
    staged.write_text(match[1])
    staged.replace(root / "configuration-version")
if sensitive:
    print("Elysia " + native.CLI_VERSION)
`;

const NativeSettings = Schema.Struct({
  env: Schema.Record(Schema.String, Schema.String),
  allowed_models: Schema.Array(Schema.String),
  model: Schema.String,
});

const extensionSettingsCodec = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const skillOverridesCodec = Schema.Record(
  Schema.String,
  Schema.Literals(["on", "name-only", "user-invocable-only", "off"]),
);

/** Import native user extensions without importing OAuth, hooks or other provider configuration. */
export async function syncElysiaExtensions(nativeDir: string, managedDir: string): Promise<void> {
  if (NodePath.resolve(nativeDir) === NodePath.resolve(managedDir)) return;
  for (const kind of ["skills", "commands"]) {
    const source = NodePath.join(nativeDir, kind);
    const entries = await NodeFSP.readdir(source, { withFileTypes: true }).catch(() => []);
    if (entries.length === 0) continue;
    const destination = NodePath.join(managedDir, kind);
    await NodeFSP.mkdir(destination, { recursive: true });
    for (const entry of entries) {
      // These commands are deployed by the native CLI with this profile's proxy port.
      if (kind === "commands" && entry.name.startsWith("elysia-")) continue;
      const from = NodePath.join(source, entry.name);
      const to = NodePath.join(destination, entry.name);
      if (
        await NodeFSP.lstat(to)
          .then((stat) => stat.isSymbolicLink())
          .catch(() => false)
      ) {
        if ((await NodeFSP.realpath(to).catch(() => "")) === (await NodeFSP.realpath(from)))
          continue;
        await NodeFSP.unlink(to);
      }
      if (
        entry.isDirectory() ||
        (entry.isSymbolicLink() && (await NodeFSP.stat(from)).isDirectory())
      ) {
        await NodeFSP.symlink(from, to, "junction").catch(() =>
          NodeFSP.cp(from, to, { recursive: true }),
        );
      } else if (kind === "commands" && entry.name.endsWith(".md")) {
        // File symlinks require extra privileges on Windows; copying keeps installation unprivileged.
        await NodeFSP.copyFile(from, to);
      }
    }
  }
  const settingsPath = NodePath.join(managedDir, "settings.json");
  const native = await NodeFSP.readFile(NodePath.join(nativeDir, "settings.json"), "utf8")
    .then(Schema.decodeUnknownSync(extensionSettingsCodec))
    .catch(() => undefined);
  if (!native) return;
  const overrides = Schema.decodeUnknownOption(skillOverridesCodec)(native.skillOverrides ?? {});
  if (overrides._tag === "None") return;
  const contents = await NodeFSP.readFile(settingsPath, "utf8");
  const managed = Schema.decodeSync(extensionSettingsCodec)(contents);
  const updated = Schema.encodeSync(extensionSettingsCodec)({
    ...managed,
    skillOverrides: overrides.value,
  });
  if (updated === contents) return;
  await NodeFSP.writeFile(settingsPath, updated, {
    mode: 0o600,
  });
}

export const makeElysiaCli = Effect.fn("makeElysiaCli")(function* (input: {
  readonly instanceId: ProviderInstanceId;
  readonly stateDir: string;
  readonly config: ClaudeSettings;
  readonly environment: NodeJS.ProcessEnv;
  readonly checkUpdates: Effect.Effect<boolean>;
}) {
  const platform = yield* HostProcessPlatform;
  const architecture = yield* HostProcessArchitecture;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = path.join(input.stateDir, "providers", `elysia-${input.instanceId}`);
  const script = path.join(root, "elysia-code.py");
  const source = expandHomePath(input.config.elysiaScriptPath || "~/.local/bin/elysia-code.py");
  const python = input.config.elysiaPythonPath || (platform === "win32" ? "python" : "python3");
  const nativeClaudeDir = yield* resolveClaudeHomePath(input.config, input.environment);
  const environment: NodeJS.ProcessEnv = {
    ...input.environment,
    PATH: [
      path.join(root, "bin"),
      path.join(root, "runtime", "node_modules", ".bin"),
      ...(platform === "darwin"
        ? [
            path.join(root, "runtime", "node", "bin"),
            path.join(root, "runtime", "python", "bin"),
            expandHomePath("~/.local/bin"),
            expandHomePath("~/.local/python/bin"),
            "/Library/Frameworks/Python.framework/Versions/Current/bin",
            "/opt/homebrew/opt/node@24/bin",
            "/usr/local/opt/node@24/bin",
            "/opt/homebrew/opt/python@3.13/libexec/bin",
            "/usr/local/opt/python@3.13/libexec/bin",
            "/opt/homebrew/bin",
            "/usr/local/bin",
          ]
        : []),
      ...(platform === "win32"
        ? [
            expandHomePath("~/.local/bin"),
            expandHomePath("~/.local/python"),
            path.join(
              input.environment.ProgramFiles || process.env.ProgramFiles || "C:\\Program Files",
              "nodejs",
            ),
            path.join(
              input.environment.ProgramFiles || process.env.ProgramFiles || "C:\\Program Files",
              "Git",
              "cmd",
            ),
            ...(input.environment.LOCALAPPDATA || process.env.LOCALAPPDATA
              ? [
                  path.join(
                    (input.environment.LOCALAPPDATA || process.env.LOCALAPPDATA)!,
                    "Programs",
                    "Python",
                    "Python313",
                  ),
                  path.join(
                    (input.environment.LOCALAPPDATA || process.env.LOCALAPPDATA)!,
                    "Programs",
                    "Git",
                    "cmd",
                  ),
                ]
              : []),
          ]
        : []),
      input.environment.PATH ?? process.env.PATH ?? "",
    ].join(platform === "win32" ? ";" : ":"),
    ELYSIA_CLI_BRIDGE,
    ELYSIA_PROFILE_ROOT: root,
    ELYSIA_PYTHON: python,
    ELYSIA_STATE_DIR: input.stateDir,
    ELYSIA_REAL_HOME: process.env.HOME || process.env.USERPROFILE,
    ELYSIA_NATIVE_CLAUDE_DIR: nativeClaudeDir,
    CLAUDE_CONFIG_DIR: path.join(root, ".claude"),
    ANTHROPIC_API_KEY: "",
    CLAUDE_CODE_OAUTH_TOKEN: "",
  };
  let validated = false;
  let connectionError: string | null = null;
  const failure = (operation: string, diagnostic = "") => {
    const errorType =
      /(?:ELYSIA_ERROR:[a-z-]+:|(?:^|\n))(AttributeError|FileNotFoundError|ImportError|KeyError|ModuleNotFoundError|OSError|PermissionError|RuntimeError|SyntaxError|SystemExit|TypeError|ValueError)(?::|\s|$)/.exec(
        diagnostic,
      )?.[1];
    const detail = diagnostic.includes("ELYSIA_ERROR:download-cli")
      ? "The Elysia CLI package could not be downloaded from the company release server. Check the connection and retry."
      : diagnostic.includes("ELYSIA_ERROR:package-invalid")
        ? "The Elysia download was not a valid installation package. Retry or contact your company administrator."
        : diagnostic.includes("ELYSIA_ERROR:install-cli")
          ? "The native Elysia setup script could not complete installation. Retry or run the package setup script in Terminal."
          : operation === "install-git" && platform === "darwin"
            ? "Git is required for native tracing. Finish Apple's Command Line Tools installation, then continue setup."
            : diagnostic.includes("ELYSIA_ERROR:tls")
              ? "The native Elysia CLI could not verify the connection certificate. Retry native CLI setup."
              : diagnostic.includes("ELYSIA_ERROR:credentials")
                ? "Elysia credentials are incomplete or were rejected. Check your workspace, config and user IDs, and API key."
                : diagnostic.includes("ELYSIA_ERROR:compression")
                  ? "Elysia compression is unavailable. Retry setup to install and start the local proxy."
                  : diagnostic.includes("ELYSIA_ERROR:gateway")
                    ? "The native Elysia CLI could not complete the gateway request. Retry or check the CLI connection."
                    : diagnostic.includes("ELYSIA_ERROR:configuration")
                      ? "The native Elysia CLI configuration could not be loaded."
                      : diagnostic.includes("ELYSIA_ERROR:prerequisites")
                        ? "The native Elysia CLI prerequisite step failed."
                        : "The Elysia CLI command could not complete.";
    return new ProviderSetupError({
      instanceId: input.instanceId,
      operation,
      detail: `${detail} Step: ${operation}${errorType ? ` (${errorType})` : ""}.`,
    });
  };
  const command = (
    operation: string,
    values?: Readonly<Record<string, string>>,
    args: ReadonlyArray<string> = [],
  ) =>
    ChildProcess.make(python, ["-c", ELYSIA_CLI_BRIDGE, source, root, operation, ...args], {
      env: { ...environment, ELYSIA_CLI_BRIDGE },
      extendEnv: true,
      stdin: values ? Stream.make(new TextEncoder().encode(JSON.stringify(values))) : "ignore",
    });
  const run = Effect.fn("ElysiaCli.run")(function* (
    operation: string,
    values?: Readonly<Record<string, string>>,
    args: ReadonlyArray<string> = [],
  ) {
    const result = yield* spawnAndCollect(python, command(operation, values, args)).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.mapError(() => failure(operation)),
    );
    if (result.code !== 0) {
      const error = failure(operation, result.stderr);
      if (["--init", "adopt", "validate"].includes(operation)) {
        validated = false;
        connectionError = error.detail;
      }
      return yield* error;
    }
    if (result.stderr.includes("ELYSIA_WARNING:addons"))
      yield* Effect.logWarning(
        "Native Elysia addon setup did not complete; sign-in was preserved.",
      );
    if (result.stderr.includes("ELYSIA_WARNING:compression"))
      yield* Effect.logWarning(
        "Native Elysia compression setup did not complete; sign-in was preserved.",
      );
    if (["--init", "adopt", "validate"].includes(operation)) {
      validated = true;
      connectionError = null;
    }
  });
  const readSettings = fs
    .readFileString(path.join(root, ".claude", "settings.json"))
    .pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeSettings))),
      Effect.option,
    );
  const bootstrap = Effect.fn("ElysiaCli.bootstrap")(function* (
    progress: (message: string) => Effect.Effect<void>,
  ) {
    const execute = Effect.fnUntraced(function* (binary: string, args: ReadonlyArray<string>) {
      const spawn = yield* resolveSpawnCommand(binary, args, { env: environment, extendEnv: true });
      return yield* spawnAndCollect(
        binary,
        ChildProcess.make(spawn.command, spawn.args, {
          env: environment,
          extendEnv: true,
          stdin: "ignore",
          shell: spawn.shell,
        }),
      ).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.option,
      );
    });
    const succeeds = (result: {
      readonly _tag: string;
      readonly value?: { readonly code: number; readonly stdout: string };
    }) => result._tag === "Some" && result.value?.code === 0;
    const installMacRuntime = Effect.fnUntraced(function* (runtime: "node" | "python") {
      if (architecture !== "arm64" && architecture !== "x64")
        return yield* failure(`install-${runtime}`);
      const filename =
        runtime === "node"
          ? `node-v24.21.0-darwin-${architecture}.tar.gz`
          : `cpython-3.12.9+20250317-${architecture === "arm64" ? "aarch64" : "x86_64"}-apple-darwin-install_only_stripped.tar.gz`;
      const baseUrl =
        runtime === "node"
          ? "https://nodejs.org/dist/v24.21.0/"
          : "https://github.com/astral-sh/python-build-standalone/releases/download/20250317/";
      const manifest = yield* execute("curl", [
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        baseUrl + (runtime === "node" ? "SHASUMS256.txt" : `${filename}.sha256`),
      ]);
      const expected =
        manifest._tag === "Some" && manifest.value.code === 0
          ? runtime === "python"
            ? manifest.value.stdout.trim()
            : manifest.value.stdout
                .split("\n")
                .find((line) => line.trim().split(/\s+/)[1] === filename)
                ?.split(/\s+/)[0]
          : undefined;
      if (!expected || !/^[a-f0-9]{64}$/.test(expected))
        return yield* failure(`install-${runtime}`);
      const temporary = yield* fs
        .makeTempDirectoryScoped({ prefix: "elysia-runtime-" })
        .pipe(Effect.mapError(() => failure(`install-${runtime}`)));
      const archive = path.join(temporary, filename);
      if (
        !succeeds(
          yield* execute("curl", [
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            archive,
            baseUrl + filename,
          ]),
        )
      )
        return yield* failure(`install-${runtime}`);
      const checksum = yield* execute("shasum", ["-a", "256", archive]);
      if (
        checksum._tag !== "Some" ||
        checksum.value.code !== 0 ||
        checksum.value.stdout.split(/\s+/)[0] !== expected
      )
        return yield* failure(`install-${runtime}`);
      const destination = path.join(root, "runtime", runtime);
      yield* fs
        .makeDirectory(destination, { recursive: true })
        .pipe(Effect.mapError(() => failure(`install-${runtime}`)));
      return yield* execute("tar", ["-xzf", archive, "--strip-components=1", "-C", destination]);
    });
    const claude = yield* execute(input.config.binaryPath || "claude", ["--version"]);
    const claudeVersion =
      claude._tag === "Some" ? claude.value.stdout.match(/\d+\.\d+\.\d+/)?.[0] : undefined;
    const needsClaude =
      !succeeds(claude) || !claudeVersion || compareSemverVersions(claudeVersion, "2.1.51") < 0;
    yield* progress("1/4 · Checking Node.js…");
    const node = needsClaude ? yield* execute("node", ["--version"]) : undefined;
    if (
      needsClaude &&
      node &&
      (!succeeds(node) ||
        (node._tag === "Some" && Number(node.value.stdout.match(/\d+/)?.[0]) < 18))
    ) {
      yield* progress("1/4 · Installing Node.js…");
      const installed =
        platform === "darwin"
          ? yield* installMacRuntime("node")
          : platform === "win32"
            ? yield* execute("winget", [
                "install",
                "--id",
                "OpenJS.NodeJS.LTS",
                "--exact",
                "--accept-package-agreements",
                "--accept-source-agreements",
              ])
            : undefined;
      if (!installed || !succeeds(installed) || !succeeds(yield* execute("node", ["--version"])))
        return yield* failure("install-node");
    }
    yield* progress("2/4 · Checking Python…");
    const pythonCheck = yield* execute(python, [
      "-c",
      "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)",
    ]);
    if (!succeeds(pythonCheck)) {
      yield* progress("2/4 · Installing Python…");
      const installed =
        platform === "darwin"
          ? yield* installMacRuntime("python")
          : platform === "win32"
            ? yield* execute("winget", [
                "install",
                "--id",
                "Python.Python.3.13",
                "--exact",
                "--accept-package-agreements",
                "--accept-source-agreements",
              ])
            : undefined;
      if (
        !installed ||
        !succeeds(installed) ||
        !succeeds(
          yield* execute(python, [
            "-c",
            "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)",
          ]),
        )
      )
        return yield* failure("install-python");
    }
    yield* progress("2/4 · Checking Git for the native tracing plugin…");
    if (!succeeds(yield* execute("git", ["--version"]))) {
      yield* progress("2/4 · Installing Git…");
      const installed =
        platform === "darwin"
          ? yield* execute("xcode-select", ["--install"])
          : platform === "win32"
            ? yield* execute("winget", [
                "install",
                "--id",
                "Git.Git",
                "--exact",
                "--accept-package-agreements",
                "--accept-source-agreements",
              ])
            : undefined;
      if (!installed || !succeeds(installed) || !succeeds(yield* execute("git", ["--version"])))
        return yield* failure("install-git");
    }
    yield* progress("3/4 · Checking Claude Code…");
    if (needsClaude) {
      yield* progress("3/4 · Installing Claude Code…");
      if (
        !succeeds(
          yield* execute(platform === "win32" ? "npm.cmd" : "npm", [
            "install",
            "--prefix",
            path.join(root, "runtime"),
            "--allow-scripts=@anthropic-ai/claude-code",
            "@anthropic-ai/claude-code",
          ]),
        )
      )
        return yield* failure("install-claude");
    }
    yield* progress("4/4 · Downloading and installing Elysia CLI…");
    yield* run("bootstrap");
    yield* progress("4/4 · Prerequisites ready. Enter your company credentials.");
  });
  const compression = fs.readFileString(path.join(root, ".elysia", "compression.json")).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.fromJsonString(
          Schema.Struct({
            enabled: Schema.Boolean,
            port: Schema.Number.check(
              Schema.isInt(),
              Schema.isBetween({ minimum: 1024, maximum: 65535 }),
            ),
          }),
        ),
      ),
    ),
    Effect.option,
  );
  const ready = fs.exists(path.join(root, "ready")).pipe(
    Effect.map((exists) => exists && validated),
    Effect.orElseSucceed(() => false),
  );
  const refreshEnvironment = Effect.gen(function* () {
    const settings = yield* readSettings;
    if (settings._tag === "Some") {
      Object.assign(environment, settings.value.env);
      yield* Effect.tryPromise(() =>
        syncElysiaExtensions(nativeClaudeDir, path.join(root, ".claude")),
      ).pipe(Effect.ignore);
    }
  });
  const reuseCredentials = Effect.fn("ElysiaCli.reuseCredentials")(function* () {
    const wasReady = yield* fs
      .exists(path.join(root, "ready"))
      .pipe(Effect.orElseSucceed(() => false));
    const disconnected = yield* fs
      .exists(path.join(root, "disconnected"))
      .pipe(Effect.orElseSucceed(() => false));
    const nativeInstalled =
      (yield* fs.exists(script).pipe(Effect.orElseSucceed(() => false))) ||
      (yield* fs.exists(source).pipe(Effect.orElseSucceed(() => false)));
    const nativeConfigured = yield* fs
      .exists(path.join(nativeClaudeDir, "settings.json"))
      .pipe(Effect.orElseSucceed(() => false));
    const readProfile = (operation: "validate" | "adopt") =>
      run(operation).pipe(
        Effect.catch((error) => {
          if (error.detail.includes("credentials are incomplete")) return Effect.void;
          return Effect.fail(error);
        }),
      );
    if (nativeInstalled && !disconnected) {
      if (wasReady) yield* readProfile("validate");
      if (!(yield* ready) && nativeConfigured) yield* readProfile("adopt");
    }
    yield* refreshEnvironment;
    return yield* ready;
  });
  if (input.config.enabled)
    yield* reuseCredentials().pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          connectionError = error.detail;
        }),
      ),
    );
  yield* refreshEnvironment;
  if (input.config.elysiaDefaultModel && (yield* ready)) {
    const settings = yield* readSettings;
    if (settings._tag === "Some" && settings.value.model !== input.config.elysiaDefaultModel) {
      if (!settings.value.allowed_models.includes(input.config.elysiaDefaultModel))
        return yield* failure("model");
      yield* run("--model", undefined, [input.config.elysiaDefaultModel]);
      yield* refreshEnvironment;
    }
  }
  const requireReady = Effect.gen(function* () {
    if (!input.config.enabled) return yield* failure("disabled");
    if (!(yield* ready))
      return yield* new ProviderSetupError({
        instanceId: input.instanceId,
        operation: "connect",
        detail:
          connectionError ?? "Connect Elysia using your native CLI credentials before coding.",
      });
    yield* refreshEnvironment;
  });
  const accountUsage = Effect.gen(function* () {
    if (!input.config.enabled || !(yield* ready))
      return { status: "unavailable", reason: "not-connected" } as const;
    const result = yield* spawnAndCollect(python, command("--config")).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.timeout("15 seconds"),
      Effect.option,
      Effect.withTracerEnabled(false),
    );
    if (result._tag === "None" || result.value.code !== 0)
      return { status: "unavailable", reason: "cli-unavailable" } as const;
    return parseElysiaAccountUsage(result.value.stdout);
  });
  const version = fs.readFileString(script).pipe(
    Effect.catch(() => fs.readFileString(source)),
    Effect.map((source) => /CLI_VERSION\s*=\s*"([^"]+)"/.exec(source)?.[1] ?? null),
    Effect.orElseSucceed(() => null),
  );
  const maintenance = Effect.gen(function* () {
    const installed = yield* fs.exists(script).pipe(Effect.orElseSucceed(() => false));
    const latest =
      installed && (yield* input.checkUpdates)
        ? yield* spawnAndCollect(python, command("latest")).pipe(
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
            Effect.map((result) =>
              result.code === 0 && /^\d+\.\d+\.\d+$/.test(result.stdout.trim())
                ? result.stdout.trim()
                : null,
            ),
            Effect.orElseSucceed(() => null),
          )
        : null;
    return makeProviderMaintenanceCapabilities({
      provider: ProviderDriverKind.make("claudeAgent"),
      packageName: null,
      updateExecutable: installed ? python : null,
      updateArgs: ["-c", ELYSIA_CLI_BRIDGE, source, root, "--update"],
      updateLockKey: root,
      updateCommand: "elysia-code --update",
      env: { ...environment, ELYSIA_CLI_BRIDGE },
      latestVersion: latest,
    });
  });
  return {
    root,
    environment,
    readSettings,
    compression,
    ready,
    connectionError: Effect.sync(() => connectionError),
    requireReady,
    refreshEnvironment,
    run,
    version,
    configurationVersion: fs.readFileString(path.join(root, "configuration-version")).pipe(
      Effect.map((value) => value.trim()),
      Effect.orElseSucceed(() => null),
    ),
    maintenance,
    bootstrap,
    reuseCredentials,
    accountUsage,
    restoreCompression: run("restore-compression").pipe(
      Effect.timeout("20 seconds"),
      Effect.mapError(() => failure("restore-compression", "ELYSIA_ERROR:compression")),
    ),
    logout: run("--compression-disable").pipe(
      Effect.andThen(
        Effect.sync(() => {
          validated = false;
        }),
      ),
      Effect.andThen(fs.writeFileString(path.join(root, "disconnected"), "")),
      Effect.andThen(fs.remove(path.join(root, "ready"), { force: true })),
      Effect.andThen(fs.remove(path.join(root, ".claude"), { recursive: true, force: true })),
      Effect.mapError(() => failure("logout")),
    ),
  };
});
