import { describe, expect, it } from "vite-plus/test";

import { isNightlyDesktopVersion, resolveDesktopReleaseChannel } from "./updateChannels.ts";
import { resolveDefaultDesktopSettings } from "../settings/DesktopAppSettings.ts";

describe("updateChannels", () => {
  it("uses only the latest update channel for prerelease installations", () => {
    expect(isNightlyDesktopVersion("0.0.41-preview.20260911.7")).toBe(true);
    expect(resolveDefaultDesktopSettings("0.0.41-preview.20260911.7").updateChannel).toBe("latest");
    expect(resolveDefaultDesktopSettings("0.0.41-nightly.20260911.7").updateChannel).toBe("latest");
  });

  it.each(["0.0.43", "1.2.3+build.7", "1.2.3+build-name.7"])(
    "admits the stable feed version %s",
    (version) => {
      expect(resolveDesktopReleaseChannel(version)).toBe("latest");
    },
  );

  it.each([
    "1.2.3-preview.20261001.1",
    "1.2.3-rc.1",
    "1.2.3-beta.1",
    "invalid-version",
    "1.2",
    "1.2.3-",
    "1.2.3+",
  ])("rejects non-release feed version %s", (version) => {
    expect(resolveDesktopReleaseChannel(version)).toBeNull();
  });

  it("keeps a nightly feed on its own channel even when the installation uses latest", () => {
    const version = "1.2.3-nightly.20261001.1";
    expect(resolveDesktopReleaseChannel(version)).toBe("nightly");
    expect(resolveDefaultDesktopSettings(version).updateChannel).toBe("latest");
  });

  it("only matches the first prerelease identifier", () => {
    expect(isNightlyDesktopVersion("1.2.3-foo-preview.20260911.1")).toBe(false);
    expect(isNightlyDesktopVersion("1.2.3")).toBe(false);
  });
});
