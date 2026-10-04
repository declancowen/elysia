import { SINGLE_PROVIDER_UI, type ScopedProjectRef } from "@t3tools/contracts";
import { showContextMenuFallback } from "../../contextMenuFallback";
import { readLocalApi } from "../../localApi";
import { toastManager } from "../ui/toast";
import { openAgentDialog } from "./agentDialogStore";

export async function showAgentContextMenu(
  projectRef: ScopedProjectRef,
  position: { x: number; y: number },
  channel = false,
  onOpenInNewTab?: () => Promise<boolean>,
) {
  const api = readLocalApi();
  if (!api) return false;
  try {
    const show = SINGLE_PROVIDER_UI ? showContextMenuFallback : api.contextMenu.show;
    const action = await show(
      [
        ...(SINGLE_PROVIDER_UI && onOpenInNewTab
          ? [{ id: "open-new-tab", label: "Open in new tab" }]
          : []),
        { id: "edit-agent", label: channel ? "Edit channel" : "Edit agent", icon: "edit-03" },
      ],
      position,
    );
    if (action === "open-new-tab") return (await onOpenInNewTab?.()) ?? false;
    if (action === "edit-agent") {
      openAgentDialog(projectRef);
      return true;
    }
  } catch {
    toastManager.add({
      type: "error",
      title: "Could not open agent actions",
      description: "Try again.",
    });
  }
  return false;
}
