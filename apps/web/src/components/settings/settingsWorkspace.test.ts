import { describe, expect, it } from "vite-plus/test";
import { SETTINGS_SEARCH_ITEMS, searchSettings } from "./settingsSearch";
import {
  isSettingsCommandVisibleInWorkspace,
  isSettingsPathVisibleInWorkspace,
  isSettingsTargetVisibleInWorkspace,
} from "./settingsWorkspace";

describe("workspace settings visibility", () => {
  const itemsFor = (code: boolean) =>
    SETTINGS_SEARCH_ITEMS.filter(
      (item) =>
        isSettingsPathVisibleInWorkspace(item.to, code) &&
        isSettingsTargetVisibleInWorkspace("targetId" in item ? item.targetId : item.id, code),
    );

  it("hides Git and checkout settings in Work search while preserving appearance and model settings", () => {
    const work = itemsFor(false);
    expect(searchSettings("git", work).some((item) => item.to === "/settings/source-control")).toBe(
      false,
    );
    expect(searchSettings("worktree", work)).toEqual([]);
    expect(work.some((item) => item.id === "default-model")).toBe(true);
    expect(work.some((item) => item.to === "/settings/appearance")).toBe(true);
    expect(itemsFor(true)).toEqual(SETTINGS_SEARCH_ITEMS);
  });

  it("also rejects direct developer destinations and hidden setting anchors", () => {
    for (const path of [
      "/settings/projects",
      "/settings/source-control",
      "/settings/integrations",
    ]) {
      expect(isSettingsPathVisibleInWorkspace(path, false)).toBe(false);
      expect(isSettingsPathVisibleInWorkspace(path, true)).toBe(true);
    }
    for (const target of [
      "#new-threads",
      "#storage-worktrees",
      "#git-fetch-interval",
      "#auto-settle-merged-threads",
      "#keybinding-terminal.toggle",
    ]) {
      expect(isSettingsTargetVisibleInWorkspace(target, false)).toBe(false);
      expect(isSettingsTargetVisibleInWorkspace(target, true)).toBe(true);
    }
    expect(isSettingsTargetVisibleInWorkspace("#default-model", false)).toBe(true);
  });

  it("filters developer shortcut editing without discarding saved bindings", () => {
    for (const command of [
      "terminal.toggle",
      "composer.branch",
      "composer.previousWorktree",
      "script.build.run",
      "diff.toggle",
    ]) {
      expect(isSettingsCommandVisibleInWorkspace(command, false)).toBe(false);
      expect(isSettingsCommandVisibleInWorkspace(command, true)).toBe(true);
    }
    expect(isSettingsCommandVisibleInWorkspace("chat.newWithoutProject", false)).toBe(true);
    expect(isSettingsCommandVisibleInWorkspace("appearance.cycle", false)).toBe(true);
  });
});
