import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { beforeEach, vi } from "vite-plus/test";

const { autoUpdaterMock } = vi.hoisted(() => ({
  autoUpdaterMock: {
    allowDowngrade: false,
    allowPrerelease: false,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    channel: "latest",
    disableDifferentialDownload: false,
    fullChangelog: false,
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    downloadUpdate: vi.fn(() => Promise.resolve([])),
    on: vi.fn(),
    quitAndInstall: vi.fn(),
    removeListener: vi.fn(),
    setFeedURL: vi.fn(),
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: autoUpdaterMock,
}));

import * as ElectronUpdater from "./ElectronUpdater.ts";

describe("ElectronUpdater", () => {
  beforeEach(() => {
    autoUpdaterMock.allowDowngrade = false;
    autoUpdaterMock.allowPrerelease = false;
    autoUpdaterMock.autoDownload = true;
    autoUpdaterMock.autoInstallOnAppQuit = true;
    autoUpdaterMock.channel = "latest";
    autoUpdaterMock.disableDifferentialDownload = false;
    autoUpdaterMock.fullChangelog = false;
    autoUpdaterMock.checkForUpdates.mockClear();
    autoUpdaterMock.checkForUpdates.mockImplementation(() => Promise.resolve(null));
    autoUpdaterMock.downloadUpdate.mockClear();
    autoUpdaterMock.downloadUpdate.mockImplementation(() => Promise.resolve([]));
    autoUpdaterMock.on.mockClear();
    autoUpdaterMock.quitAndInstall.mockClear();
    autoUpdaterMock.removeListener.mockClear();
    autoUpdaterMock.setFeedURL.mockClear();
  });

  it.effect("scopes updater event listeners", () =>
    Effect.gen(function* () {
      const listener = vi.fn();

      yield* Effect.scoped(
        Effect.gen(function* () {
          const updater = yield* ElectronUpdater.ElectronUpdater;
          yield* updater.on("update-available", listener);
        }),
      );

      assert.deepEqual(autoUpdaterMock.on.mock.calls, [["update-available", listener]]);
      assert.deepEqual(autoUpdaterMock.removeListener.mock.calls, [["update-available", listener]]);
    }).pipe(Effect.provide(ElectronUpdater.layer)),
  );

  it.effect("wraps rejected update checks in the method-specific typed error", () =>
    Effect.gen(function* () {
      const cause = new Error("network unavailable");
      autoUpdaterMock.checkForUpdates.mockImplementationOnce(() => Promise.reject(cause));
      const updater = yield* ElectronUpdater.ElectronUpdater;
      autoUpdaterMock.channel = "beta";

      const error = yield* updater.checkForUpdates.pipe(Effect.flip);

      assert.instanceOf(error, ElectronUpdater.ElectronUpdaterCheckForUpdatesError);
      assert.equal(error.channel, "beta");
      assert.strictEqual(error.cause, cause);
      assert.equal(error.message, "Electron updater failed to check for updates on channel beta.");
      assert.notInclude(error.message, cause.message);
    }).pipe(Effect.provide(ElectronUpdater.layer)),
  );

  it.effect("preserves the execution-time channel on download failures", () =>
    Effect.gen(function* () {
      const cause = new Error("download unavailable");
      autoUpdaterMock.downloadUpdate.mockImplementationOnce(() => Promise.reject(cause));
      const updater = yield* ElectronUpdater.ElectronUpdater;
      autoUpdaterMock.channel = "nightly";

      const error = yield* updater.downloadUpdate.pipe(Effect.flip);

      assert.instanceOf(error, ElectronUpdater.ElectronUpdaterDownloadUpdateError);
      assert.equal(error.channel, "nightly");
      assert.strictEqual(error.cause, cause);
      assert.equal(
        error.message,
        "Electron updater failed to download the update on channel nightly.",
      );
      assert.notInclude(error.message, cause.message);
    }).pipe(Effect.provide(ElectronUpdater.layer)),
  );

  it.effect(
    "reports safe connection and release diagnostics without copying response secrets",
    () =>
      Effect.gen(function* () {
        const updater = yield* ElectronUpdater.ElectronUpdater;
        for (const [cause, detail] of [
          [
            new Error(
              "net::ERR_CERT_AUTHORITY_INVALID https://user:secret@example.com/?token=secret",
            ),
            "ERR_CERT_AUTHORITY_INVALID",
          ],
          [Object.assign(new Error("private proxy response"), { code: "ENOTFOUND" }), "ENOTFOUND"],
          [Object.assign(new Error("private HTTP body"), { statusCode: 403 }), "HTTP 403"],
          [
            Object.assign(new Error("private release XML"), {
              code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
            }),
            "missing its update manifest",
          ],
        ] as const) {
          autoUpdaterMock.checkForUpdates.mockImplementationOnce(() => Promise.reject(cause));
          const error = yield* updater.checkForUpdates.pipe(Effect.flip);
          assert.include(error.message, detail);
          assert.notInclude(error.message, "private");
          assert.notInclude(error.message, "secret");
          assert.notInclude(error.message, "https://");
          assert.strictEqual(error.cause, cause);
        }
      }).pipe(Effect.provide(ElectronUpdater.layer)),
  );

  it.effect("keeps actionable download and install failure codes", () =>
    Effect.gen(function* () {
      const updater = yield* ElectronUpdater.ElectronUpdater;
      autoUpdaterMock.downloadUpdate.mockImplementationOnce(() =>
        Promise.reject(
          Object.assign(new Error("private response"), { code: "ERR_CHECKSUM_MISMATCH" }),
        ),
      );
      const downloadError = yield* updater.downloadUpdate.pipe(Effect.flip);
      assert.include(downloadError.message, "published checksum (ERR_CHECKSUM_MISMATCH)");
      assert.notInclude(downloadError.message, "private");

      autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
        throw Object.assign(new Error("private path"), { code: "EACCES" });
      });
      const installError = yield* updater
        .quitAndInstall({ isSilent: true, isForceRunAfter: true })
        .pipe(Effect.flip);
      assert.include(installError.message, "denied (EACCES)");
      assert.notInclude(installError.message, "private");
    }).pipe(Effect.provide(ElectronUpdater.layer)),
  );

  it.effect("sets full changelog mode", () =>
    Effect.gen(function* () {
      const updater = yield* ElectronUpdater.ElectronUpdater;

      yield* updater.setFullChangelog(true);
      assert.equal(autoUpdaterMock.fullChangelog, true);

      yield* updater.setFullChangelog(false);
      assert.equal(autoUpdaterMock.fullChangelog, false);
    }).pipe(Effect.provide(ElectronUpdater.layer)),
  );

  it.effect("keeps a safe recovery hint for native read-only installation failures", () =>
    Effect.gen(function* () {
      const updater = yield* ElectronUpdater.ElectronUpdater;
      for (const [cause, hint] of [
        [
          new Error(
            "Cannot update while running on a read-only volume. private-path https://user:secret@example.com/?token=secret",
          ),
          "Quit Elysia, move it to Applications",
        ],
        [
          Object.assign(new Error("private path and response"), { code: "EROFS" }),
          "read-only location (EROFS)",
        ],
      ] as const) {
        autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
          throw cause;
        });
        const error = yield* updater
          .quitAndInstall({ isSilent: true, isForceRunAfter: true })
          .pipe(Effect.flip);
        assert.include(error.message, hint);
        assert.notInclude(error.message, "private");
        assert.notInclude(error.message, "secret");
        assert.notInclude(error.message, "https://");
        assert.strictEqual(error.cause, cause);
      }
    }).pipe(Effect.provide(ElectronUpdater.layer)),
  );

  it.effect("preserves quit-and-install flags and the execution-time channel", () =>
    Effect.gen(function* () {
      const cause = new Error("quit and install failed");
      autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
        throw cause;
      });
      const updater = yield* ElectronUpdater.ElectronUpdater;
      autoUpdaterMock.channel = "alpha";

      const error = yield* updater
        .quitAndInstall({ isSilent: true, isForceRunAfter: false })
        .pipe(Effect.flip);

      assert.instanceOf(error, ElectronUpdater.ElectronUpdaterQuitAndInstallError);
      assert.equal(error.channel, "alpha");
      assert.equal(error.isSilent, true);
      assert.equal(error.isForceRunAfter, false);
      assert.strictEqual(error.cause, cause);
      assert.equal(
        error.message,
        "Electron updater failed to quit and install the update on channel alpha (silent: true, force run after: false).",
      );
      assert.notInclude(error.message, cause.message);
      assert.deepEqual(autoUpdaterMock.quitAndInstall.mock.calls, [[true, false]]);
    }).pipe(Effect.provide(ElectronUpdater.layer)),
  );
});
