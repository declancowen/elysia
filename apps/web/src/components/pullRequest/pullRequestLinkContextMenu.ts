import { showContextMenuFallback } from "../../contextMenuFallback";
import { SINGLE_PROVIDER_UI, type ContextMenuItem } from "@elysiatools/contracts";
import {
  type SourceControlClientDefinition,
  UNKNOWN_SOURCE_CONTROL_CLIENT,
} from "@elysiatools/client-runtime/source-control-clients";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-external" | "open-new-tab";

export const openOnHostLabel = (host: SourceControlClientDefinition): string =>
  host === UNKNOWN_SOURCE_CONTROL_CLIENT ? "Open on host" : `Open on ${host.label}`;

function pullRequestLinkContextMenuItems(
  openLabel: string,
  openInNewTab: boolean,
): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    ...(openInNewTab
      ? [{ id: "open-new-tab" as const, label: "Open in new tab", icon: "open-new-tab" }]
      : []),
    { id: "copy-link", label: "Copy link", icon: "copy", separatorBefore: openInNewTab },
    { id: "open-external", label: openLabel, icon: "open-new-tab" },
  ];
}

export async function showPullRequestLinkContextMenu({
  url,
  openLabel,
  position,
  onOpenInNewTab,
}: {
  readonly onOpenInNewTab?: () => void;
  readonly url: string;
  readonly openLabel: string;
  readonly position: { readonly x: number; readonly y: number };
}): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    const showMenu = SINGLE_PROVIDER_UI ? showContextMenuFallback : api.contextMenu.show;
    action = await showMenu(
      pullRequestLinkContextMenuItems(openLabel, Boolean(onOpenInNewTab)),
      position,
    );
  } catch {
    return;
  }
  try {
    if (action === "open-new-tab") onOpenInNewTab?.();
    else if (action === "copy-link") await writeTextToClipboard(url, "link");
    else if (action === "open-external") await api.shell.openExternal(url);
  } catch {
    toastManager.add({
      type: "error",
      title: action === "copy-link" ? "Could not copy the link" : "Could not open the link",
    });
  }
}
