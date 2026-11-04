import { describe, expect, it } from "vite-plus/test";

import { isNightlyDesktopVersion } from "./updateChannels.ts";
import { resolveDefaultDesktopSettings } from "../settings/DesktopAppSettings.ts";

describe("updateChannels", () => {
  it("uses only the latest update channel for prerelease installations", () => {
    expect(isNightlyDesktopVersion("0.0.41-preview.20260911.7")).toBe(true);
    expect(resolveDefaultDesktopSettings("0.0.41-preview.20260911.7").updateChannel).toBe("latest");
    expect(resolveDefaultDesktopSettings("0.0.41-nightly.20260911.7").updateChannel).toBe("latest");
  });

  it("only matches the first prerelease identifier", () => {
    expect(isNightlyDesktopVersion("1.2.3-foo-preview.20260911.1")).toBe(false);
    expect(isNightlyDesktopVersion("1.2.3")).toBe(false);
  });
});
