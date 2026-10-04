import { describe, assert, it } from "vite-plus/test";
import { cn, getLocalFileManagerName, isWindowsPlatform } from "./utils";

describe("cn", () => {
  it("keeps the section font size while replacing its text color", () => {
    assert.strictEqual(
      cn("text-sidebar-section text-sidebar-foreground", "text-sidebar-muted-foreground/65"),
      "text-sidebar-section text-sidebar-muted-foreground/65",
    );
    assert.strictEqual(cn("text-sm", "text-sidebar-section"), "text-sidebar-section");
  });
});

describe("getLocalFileManagerName", () => {
  it.each([
    ["MacIntel", "Finder"],
    ["Win32", "File Explorer"],
    ["Linux", "Files"],
  ])("uses the %s file manager name", (platform, expected) => {
    assert.strictEqual(getLocalFileManagerName(platform), expected);
  });
});

describe("isWindowsPlatform", () => {
  it("matches Windows platform identifiers", () => {
    assert.isTrue(isWindowsPlatform("Win32"));
    assert.isTrue(isWindowsPlatform("Windows"));
    assert.isTrue(isWindowsPlatform("windows_nt"));
  });

  it("does not match darwin", () => {
    assert.isFalse(isWindowsPlatform("darwin"));
  });
});
