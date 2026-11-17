import { expect, it, vi } from "vite-plus/test";
import { sign as signApplication, type SignOptions } from "@electron/osx-sign";
import sign from "./sign-macos.js";

vi.mock("@electron/osx-sign", () => ({ sign: vi.fn() }));

it.each([
  ["success", 0, 1, true],
  ["A timestamp was expected but was not found.", 6, 7, true],
  ["The timestamp service is not available.", 5, 6, true],
  ["The specified identity could not be found.", 20, 1, false],
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
      const nativeSign = vi.mocked(signApplication).mockReset();
      nativeSign.mockImplementation(async (received) => {
        expect(received).toEqual({ ...options, batchCodesignCalls: true });
        attempts += 1;
        if (attempts <= failures) throw error;
      });
      const result = sign(options).then(
        () => ({ succeeded: true, error: null }),
        (error: unknown) => ({ succeeded: false, error }),
      );
      await vi.runAllTimersAsync();
      expect(await result).toEqual({ succeeded: succeeds, error: succeeds ? null : error });
      expect(nativeSign).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  },
);
