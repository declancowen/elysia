// @effect-diagnostics nodeBuiltinImport:off - exercises the installed packager patch in an isolated VM.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeVM from "node:vm";
import { expect, it, vi } from "vite-plus/test";
import type { SignOptions } from "@electron/osx-sign";

const desktopRequire = NodeModule.createRequire(
  new URL("../apps/desktop/package.json", import.meta.url),
);
const builderRequire = NodeModule.createRequire(desktopRequire.resolve("electron-builder"));
const signingFile = builderRequire.resolve("app-builder-lib/out/codeSign/macCodeSign.js");
const signingRequire = NodeModule.createRequire(signingFile);

it.each([
  ["success", 0, 1, true],
  ["A timestamp was expected but was not found.", 6, 7, true],
  ["The timestamp service is not available.", 5, 6, true],
  ["The specified identity could not be found.", 20, 4, false],
  ["A timestamp was expected but was not found.", 20, 9, false],
] as const)(
  "bounds signing retries for %s after %i failures",
  async (message, failures, calls, succeeds) => {
    vi.useFakeTimers();
    try {
      const error = new Error(message);
      const options = {
        app: "/fixture/Elysia.app",
        identity: "Fixture",
        optionsForFile: () => ({
          hardenedRuntime: true,
          entitlements: "/fixture/entitlements.plist",
        }),
      } satisfies SignOptions;
      let attempts = 0;
      const signAsync = vi.fn(async (received: typeof options) => {
        expect(received).toBe(options);
        attempts += 1;
        if (attempts <= failures) throw error;
      });
      const source = NodeFS.readFileSync(signingFile, "utf8");
      const start = source.indexOf("async function sign(opts) {");
      const end = source.indexOf("\nexports.findIdentityRawResult", start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const sign = NodeVM.runInNewContext(`(${source.slice(start, end)})`, {
        builder_util_1: signingRequire("builder-util"),
        dynamicImport_1: { dynamicImport: async () => ({ signAsync }) },
      }) as (input: typeof options) => Promise<void>;
      const result = sign(options).then(
        () => ({ succeeded: true, error: null }),
        (error: unknown) => ({ succeeded: false, error }),
      );
      await vi.runAllTimersAsync();
      expect(await result).toEqual({ succeeded: succeeds, error: succeeds ? null : error });
      expect(signAsync).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  },
);
