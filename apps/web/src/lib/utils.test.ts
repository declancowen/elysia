import { describe, assert, expect, it } from "vite-plus/test";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps the section font size while replacing its text color", () => {
    assert.strictEqual(
      cn("text-sidebar-section text-sidebar-foreground", "text-sidebar-muted-foreground/65"),
      "text-sidebar-section text-sidebar-muted-foreground/65",
    );
    assert.strictEqual(cn("text-sm", "text-sidebar-section"), "text-sidebar-section");
  });
});

describe("cn", () => {
  it("keeps a background color next to a composer seam background image", () => {
    expect(cn("dark:before:bg-transparent dark:before:bg-composer-seam-below")).toBe(
      "dark:before:bg-transparent dark:before:bg-composer-seam-below",
    );
  });
});
