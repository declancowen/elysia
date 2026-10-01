import { describe, expect, it } from "vite-plus/test";
import { BUILT_IN_THEMES, getThemeColorsForAppearance } from "@t3tools/shared/themePalettes";

import { themeColorToNativeColor } from "../../lib/mobileTheme";

import { buildGhosttyThemeConfig, getMobileTerminalTheme } from "./terminalTheme";

describe("getMobileTerminalTheme", () => {
  it("uses the shared default light terminal colors", () => {
    expect(getMobileTerminalTheme("t3-code", "light")).toMatchObject({
      background: "#FFFFFF",
      foreground: "#002244",
      cursorForeground: "#003CB2",
      cursorBackground: "#FFFFFF",
    });
  });

  it("uses the shared default dark terminal colors", () => {
    expect(getMobileTerminalTheme("t3-code", "dark")).toMatchObject({
      background: "#002244",
      foreground: "#FFFFFF",
      cursorForeground: "#28B4FF",
      cursorBackground: "#002244",
    });
  });
  it("applies the selected palette without replacing ANSI status colors", () => {
    const standard = getMobileTerminalTheme("t3-code", "dark");
    const ocean = getMobileTerminalTheme("ocean", "dark");

    expect(ocean.background).not.toBe(standard.background);
    expect(ocean.cursorForeground).not.toBe(standard.cursorForeground);
    expect(ocean.palette).toEqual(standard.palette);
  });

  it("uses the canonical desktop terminal roles for built-in themes", () => {
    const theme = BUILT_IN_THEMES.find((candidate) => candidate.id === "ocean")!;
    const colors = getThemeColorsForAppearance(theme, "dark")!;
    const terminal = getMobileTerminalTheme("ocean", "dark");

    expect(terminal.background).toBe(themeColorToNativeColor(colors.terminalBackground));
    expect(terminal.foreground).toBe(themeColorToNativeColor(colors.terminalForeground));
    expect(terminal.cursorForeground).toBe(themeColorToNativeColor(colors.terminalCursor));
  });
});

describe("buildGhosttyThemeConfig", () => {
  it("serializes theme colors into a ghostty config file", () => {
    const config = buildGhosttyThemeConfig(getMobileTerminalTheme("t3-code", "dark"));

    expect(config).toContain("background = #002244");
    expect(config).toContain("foreground = #FFFFFF");
    expect(config).toContain("cursor-color = #28B4FF");
    expect(config).toContain("cursor-text = #002244");
    expect(config).toContain("palette = 0=#141415");
    expect(config).toContain("palette = 15=#c6c6c8");
    expect(config.endsWith("\n")).toBe(true);
  });
});
