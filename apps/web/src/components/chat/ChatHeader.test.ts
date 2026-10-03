import { describe, expect, it } from "vite-plus/test";
import { resolveChatHeaderMainColumnWidth, resolveRenameCommit } from "./ChatHeader";

describe("resolveRenameCommit", () => {
  it("commits a trimmed changed title", () => {
    expect(resolveRenameCommit({ title: "  New title ", originalTitle: "Old" })).toEqual({
      action: "commit",
      title: "New title",
    });
  });

  it("rejects empty and whitespace-only titles", () => {
    expect(resolveRenameCommit({ title: "   ", originalTitle: "Old" })).toEqual({
      action: "reject-empty",
    });
  });

  it("no-ops when the trimmed title is unchanged", () => {
    expect(resolveRenameCommit({ title: " Old ", originalTitle: "Old" })).toEqual({
      action: "noop",
    });
  });
});

describe("split-panel header geometry", () => {
  it("ends main controls at the main column and starts tabs after the panel gap", () => {
    const header = { left: 312, width: 1116 };
    const width = resolveChatHeaderMainColumnWidth(header, { right: 884 });
    expect(width).toBe(572);
    expect(header.left + width + 8).toBe(892);
    expect(header.width - width - 8).toBe(536);
  });

  it("follows column resizing and caps stale measurements at the header bounds", () => {
    expect(resolveChatHeaderMainColumnWidth({ left: 312, width: 1116 }, { right: 700 })).toBe(388);
    expect(resolveChatHeaderMainColumnWidth({ left: 312, width: 1116 }, { right: 1700 })).toBe(
      1116,
    );
    expect(resolveChatHeaderMainColumnWidth({ left: 312, width: 1116 }, { right: 300 })).toBe(0);
  });
});
