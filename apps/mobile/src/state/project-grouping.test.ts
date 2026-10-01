import { describe, expect, it } from "vite-plus/test";

import {
  mobileProjectGroupingModePatch,
  resolveMobileProjectGroupingSettings,
} from "./project-grouping.logic";

describe("mobile project grouping preferences", () => {
  it("ignores saved grouping modes in the single environment app", () => {
    expect(resolveMobileProjectGroupingSettings({}).sidebarProjectGroupingMode).toBe("separate");
    expect(
      resolveMobileProjectGroupingSettings({ projectGroupingEnabled: false })
        .sidebarProjectGroupingMode,
    ).toBe("separate");
    expect(
      resolveMobileProjectGroupingSettings({
        projectGroupingEnabled: false,
        projectGroupingMode: "repository_path",
      }).sidebarProjectGroupingMode,
    ).toBe("separate");
  });

  it("dual-writes the legacy boolean for rollback compatibility", () => {
    expect(mobileProjectGroupingModePatch("separate")).toEqual({
      projectGroupingMode: "separate",
      projectGroupingEnabled: false,
    });
    expect(mobileProjectGroupingModePatch("repository_path")).toEqual({
      projectGroupingMode: "repository_path",
      projectGroupingEnabled: true,
    });
  });
});
