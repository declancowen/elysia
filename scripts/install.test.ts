// @effect-diagnostics nodeBuiltinImport:off - Exercises disabled installers as real commands.
import { HostProcessExecutablePath, HostProcessPlatform } from "@elysiatools/shared/hostProcess";
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

const releaseUrl = "https://github.com/declancowen/elysia/releases/latest";

describe("unsupported publication entry points", () => {
  it.skipIf(HostProcessPlatform.defaultValue() === "win32")(
    "shell installer directs users to the published desktop artifacts",
    () => {
      const result = NodeChildProcess.spawnSync(
        "sh",
        [NodePath.join(import.meta.dirname, "install.sh")],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(releaseUrl);
    },
  );

  it("does not build npm packages under another product's identities", () => {
    const result = NodeChildProcess.spawnSync(
      HostProcessExecutablePath.defaultValue(),
      [NodePath.join(import.meta.dirname, "build-npm-platform-packages.ts")],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Elysia does not publish packages under the legacy npm identities",
    );
    expect(result.stderr).toContain(releaseUrl);
  });

  it.skipIf(HostProcessPlatform.defaultValue() === "win32")(
    "does not invoke an AUR publisher",
    () => {
      const result = NodeChildProcess.spawnSync(
        "bash",
        [NodePath.join(import.meta.dirname, "../packaging/aur/scripts/release.sh")],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("AUR publication is disabled");
      expect(result.stderr).toContain(releaseUrl);
    },
  );
});
