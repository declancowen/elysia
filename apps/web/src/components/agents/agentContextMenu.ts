import type { ScopedProjectRef } from "@t3tools/contracts";
import { readLocalApi } from "../../localApi";
import { toastManager } from "../ui/toast";
import { openAgentDialog } from "./agentDialogStore";

export async function showAgentContextMenu(
  projectRef: ScopedProjectRef,
  position: { x: number; y: number },
) {
  const api = readLocalApi();
  if (!api) return false;
  try {
    const action = await api.contextMenu.show(
      [{ id: "edit-agent", label: "Edit agent" }],
      position,
    );
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
