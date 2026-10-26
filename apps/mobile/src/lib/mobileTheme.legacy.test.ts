import { expect, it } from "vite-plus/test";
import {
  MOBILE_THEME_IDS,
  MOBILE_THEME_OPTIONS,
  createMobileThemeSelectionPatch,
  normalizeMobileThemeId,
  resolveMobileThemeIds,
} from "./mobileTheme";
import { getMobileUniwindThemeName } from "./mobileThemeRuntime";

it.each(["t3-code", "t3-chat", "t3-chat-dark"])(
  "migrates saved %s without offering or rewriting the old name",
  (name) => {
    const migrated = normalizeMobileThemeId(name);
    expect(migrated).toBe("elysia");
    expect(getMobileUniwindThemeName(migrated, "dark")).toBe("dark");
    expect(MOBILE_THEME_IDS).not.toContain(name);
    expect(MOBILE_THEME_OPTIONS.map((option) => option.id)).not.toContain(name);
  },
);

it("preserves independent appearance choices while writing canonical names", () => {
  const migrated = resolveMobileThemeIds({
    themeId: "t3-code",
    lightThemeId: "t3-chat",
    darkThemeId: "t3-grove",
  });
  expect(migrated).toEqual({ light: "elysia", dark: "grove" });
  expect(createMobileThemeSelectionPatch(migrated, "dark", "light", "elysia")).toEqual({
    lightThemeId: "elysia",
    darkThemeId: "grove",
    themeId: "grove",
  });
});
