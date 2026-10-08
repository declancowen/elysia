import type { Page } from "@elysiatools/contracts";

export function canAdoptPageSnapshot(
  source: Page | undefined,
  summary: { revision: number } | undefined,
  saved: Page | null,
  dirty: boolean,
) {
  return Boolean(
    source &&
    summary &&
    source.revision >= summary.revision &&
    (!saved || (!dirty && source.revision > saved.revision)),
  );
}

export function pageHasUnsavedChanges(draft: Page | null, saved: Page | null) {
  return Boolean(
    draft &&
    saved &&
    (draft.title !== saved.title ||
      draft.content !== saved.content ||
      draft.projectId !== saved.projectId),
  );
}
/** A save receipt advances the baseline without erasing fields edited during the request. */
export function reconcilePageSave(current: Page | null, submitted: Page, receipt: Page): Page {
  if (!current) return receipt;
  return {
    ...receipt,
    title: current.title === submitted.title ? receipt.title : current.title,
    content: current.content === submitted.content ? receipt.content : current.content,
    projectId: current.projectId === submitted.projectId ? receipt.projectId : current.projectId,
  };
}
const WIDTH_KEY = "elysia.pages.canvas-width";
export function readPageCanvasWidth(storage?: Pick<Storage, "getItem">): "readable" | "surface" {
  try {
    return storage?.getItem(WIDTH_KEY) === "surface" ? "surface" : "readable";
  } catch {
    return "readable";
  }
}
export function writePageCanvasWidth(
  width: "readable" | "surface",
  storage?: Pick<Storage, "setItem">,
) {
  try {
    storage?.setItem(WIDTH_KEY, width);
  } catch {
    /* The canvas remains usable when browser storage is unavailable. */
  }
}
