import { describe, expect, it } from "vite-plus/test";
import { PageId, type Page, ProjectId } from "@elysiatools/contracts";
import {
  pageHasUnsavedChanges,
  canAdoptPageSnapshot,
  reconcilePageSave,
  readPageCanvasWidth,
  writePageCanvasWidth,
} from "./PageDetailPage.logic";
const baseline: Page = {
  id: PageId.make("page-00000000-0000-4000-8000-000000000001"),
  title: "Original",
  content: "<p>Original</p>",
  projectId: null,
  createdAt: "2026-10-05T10:00:00.000Z",
  updatedAt: "2026-10-05T10:00:00.000Z",
  revision: 1,
};
describe("page autosave receipts", () => {
  it("waits for a current snapshot and preserves drafts when a cached page is reopened", () => {
    const current = { ...baseline, revision: 2, content: "<p>Latest saved content</p>" };
    expect(canAdoptPageSnapshot(baseline, current, null, false)).toBe(false);
    expect(canAdoptPageSnapshot(current, current, null, false)).toBe(true);
    expect(canAdoptPageSnapshot(current, current, baseline, true)).toBe(false);
    expect(canAdoptPageSnapshot(current, current, baseline, false)).toBe(true);
    expect(canAdoptPageSnapshot(current, undefined, null, false)).toBe(false);
  });
  it("preserves typing and project edits made while a save was in flight", () => {
    const submitted = { ...baseline, title: "Updated", content: "<p>First edit</p>" };
    const receipt = { ...submitted, revision: 2, updatedAt: "2026-10-05T10:01:00.000Z" };
    const current = {
      ...submitted,
      content: "<p>Second edit</p>",
      projectId: ProjectId.make("project-1"),
    };
    const draft = reconcilePageSave(current, submitted, receipt);
    expect(draft.title).toBe("Updated");
    expect(draft.content).toBe("<p>Second edit</p>");
    expect(draft.projectId).toBe(current.projectId);
    expect(draft.revision).toBe(2);
    expect(pageHasUnsavedChanges(draft, receipt)).toBe(true);
    expect(
      pageHasUnsavedChanges(reconcilePageSave(draft, draft, { ...draft, revision: 3 }), {
        ...draft,
        revision: 3,
      }),
    ).toBe(false);
  });
  it("adopts server normalization only for fields unchanged since submission", () => {
    const submitted = { ...baseline, title: " Title " };
    const receipt = { ...submitted, title: "Title", revision: 2 };
    expect(reconcilePageSave(submitted, submitted, receipt).title).toBe("Title");
    expect(reconcilePageSave({ ...submitted, title: "New title" }, submitted, receipt).title).toBe(
      "New title",
    );
    expect(pageHasUnsavedChanges(null, baseline)).toBe(false);
  });
  it("persists canvas width and tolerates unavailable browser storage", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    expect(readPageCanvasWidth(storage)).toBe("readable");
    writePageCanvasWidth("surface", storage);
    expect(readPageCanvasWidth(storage)).toBe("surface");
    const unavailable = {
      getItem: () => {
        throw new Error("Unavailable");
      },
      setItem: () => {
        throw new Error("Unavailable");
      },
    };
    expect(readPageCanvasWidth(unavailable)).toBe("readable");
    expect(() => writePageCanvasWidth("surface", unavailable)).not.toThrow();
  });
});
