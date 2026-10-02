import { describe, expect, it } from "vite-plus/test";
import { resolveAutomaticProjectIcon } from "./projectIcon.ts";

describe("automatic project icons", () => {
  it.each([
    ["Recipe Room", "chef-hat"],
    ["RecipeRoom", "chef-hat"],
    ["Downloads", "download"],
    ["recipe-room-website", "chef-hat"],
    ["Analytics_DB", "database"],
    ["Mobile App", "smartphone"],
    ["Agent Runtime", "bot"],
    ["Travel notebook", "folder"],
    ["Codependency", "folder"],
    ["", "folder"],
  ])("chooses a library glyph for %s", (name, expected) => {
    expect(resolveAutomaticProjectIcon(name).name).toBe(expected);
  });

  it("reuses normalized cached matches and resolves renamed projects without a stale icon", () => {
    const recipe = resolveAutomaticProjectIcon("Recipe Room");
    expect(resolveAutomaticProjectIcon("  RECIPE__ROOM  ")).toBe(recipe);
    expect(resolveAutomaticProjectIcon("Downloads").name).toBe("download");
    expect(resolveAutomaticProjectIcon("Recipe Room")).toBe(recipe);
  });

  it("bounds retained names while keeping evicted matches deterministic", () => {
    const first = resolveAutomaticProjectIcon("Downloads cache boundary");
    for (let index = 0; index < 256; index++) resolveAutomaticProjectIcon(`project-${index}`);
    const resolved = resolveAutomaticProjectIcon("Downloads cache boundary");
    expect(resolved).toEqual(first);
    expect(resolved).not.toBe(first);
  });
});
