import { beforeEach, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("./ui/toast", () => ({ toastManager: { add: state.add } }));
import {
  showDesktopUpdateDownloadedToast,
  openDesktopUpdateReleaseNotes,
} from "./desktopUpdate.toast";
beforeEach(() => state.add.mockClear());
it("shows a simple update-ready message at the bottom right", () => {
  showDesktopUpdateDownloadedToast();
  expect(state.add).toHaveBeenCalledExactlyOnceWith({
    type: "success",
    title: "Update ready",
    description: "Restart Elysia to install.",
    data: { position: "bottom-right" },
  });
});
it.each([false, "reject"])(
  "keeps release-note errors visible for other update controls (%s)",
  async (outcome) => {
    const openExternal =
      outcome === "reject"
        ? vi.fn().mockRejectedValue(new Error("Unavailable"))
        : vi.fn().mockResolvedValue(false);
    await openDesktopUpdateReleaseNotes({ openExternal }, "https://example.com/releases");
    expect(state.add).toHaveBeenCalledWith({
      type: "error",
      title: "Unable to open release notes",
    });
  },
);
