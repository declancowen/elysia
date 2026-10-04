import type { DesktopBridge } from "@t3tools/contracts";

import { toastManager } from "./ui/toast";

type DesktopUpdateShell = Pick<DesktopBridge, "openExternal">;

export async function openDesktopUpdateReleaseNotes(
  shell: DesktopUpdateShell | undefined,
  releaseUrl: string,
): Promise<void> {
  try {
    if (shell && (await shell.openExternal(releaseUrl))) return;
  } catch {
    // Surface rejected IPC calls through the same user-visible fallback.
  }
  toastManager.add({ type: "error", title: "Unable to open release notes" });
}

export function showDesktopUpdateDownloadedToast(): void {
  toastManager.add({
    type: "success",
    title: "Update ready",
    description: "Restart Elysia to install.",
    data: { position: "bottom-right" },
  });
}
