import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import * as ElectronUpdater from "../electron/ElectronUpdater.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopUpdates from "./DesktopUpdates.ts";
import { flushCallbacks, makeHarness } from "./updatesTestHarness.ts";

const prereleaseVersions = ["1.2.5-nightly.20261001.1", "1.2.5-preview.20261001.1", "1.2.5-rc.1"];

describe("Elysia stable updates", () => {
  it.effect("keeps the stable channel when a caller requests nightly", () => {
    const harness = makeHarness();

    return Effect.scoped(
      Effect.gen(function* () {
        const updates = yield* DesktopUpdates.DesktopUpdates;
        const settings = yield* DesktopAppSettings.DesktopAppSettings;
        const updater = yield* ElectronUpdater.ElectronUpdater;
        yield* updates.configure;

        const state = yield* updates.setChannel("nightly");
        assert.equal(state.channel, "latest");
        assert.equal((yield* settings.get).updateChannel, "latest");
        assert.isFalse(yield* updater.allowDowngrade);
        assert.isFalse(harness.fullChangelog());
        assert.equal(harness.checkCount(), 0);
      }),
    ).pipe(Effect.provide(Layer.merge(TestClock.layer(), harness.layer)));
  });

  it.effect("rejects prerelease feed and download events", () => {
    const harness = makeHarness();

    return Effect.scoped(
      Effect.gen(function* () {
        const updates = yield* DesktopUpdates.DesktopUpdates;
        yield* updates.configure;

        for (const version of [...prereleaseVersions, "invalid-version"]) {
          yield* updates.check("manual");
          harness.emit("update-available", { version });
          yield* flushCallbacks;
          harness.emit("update-downloaded", { version });
          yield* flushCallbacks;

          const state = yield* updates.getState;
          assert.equal(state.status, "up-to-date");
          assert.equal(state.channel, "latest");
          assert.isNull(state.availableVersion);
          assert.isNull(state.downloadedVersion);
        }
      }),
    ).pipe(Effect.provide(Layer.merge(TestClock.layer(), harness.layer)));
  });

  it.effect("keeps a downloaded stable installer and its notes when prereleases appear", () => {
    const harness = makeHarness();

    return Effect.scoped(
      Effect.gen(function* () {
        const updates = yield* DesktopUpdates.DesktopUpdates;
        yield* updates.configure;

        harness.emit("update-available", {
          version: "1.2.4",
          releaseNotes: [
            { version: "1.2.4", note: "- Stable change" },
            ...prereleaseVersions.map((version) => ({ version, note: "- Prerelease change" })),
          ],
        });
        yield* flushCallbacks;
        harness.emit("update-downloaded", { version: "1.2.4" });
        yield* flushCallbacks;

        for (const version of prereleaseVersions) {
          yield* updates.check("poll");
          harness.emit("update-available", { version });
          yield* flushCallbacks;
          harness.emit("update-downloaded", { version });
          yield* flushCallbacks;

          const state = yield* updates.getState;
          assert.equal(state.status, "downloaded");
          assert.equal(state.availableVersion, "1.2.4");
          assert.equal(state.downloadedVersion, "1.2.4");
          assert.equal(state.downloadPercent, 100);
          assert.deepEqual(state.releaseNotes, [
            { version: "1.2.4", items: ["Stable change"], totalItems: 1 },
          ]);
        }
      }),
    ).pipe(Effect.provide(Layer.merge(TestClock.layer(), harness.layer)));
  });
});
