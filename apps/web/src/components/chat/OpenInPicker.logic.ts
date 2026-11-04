import type { EnvironmentId } from "@elysiatools/contracts";

import type { RemoteOpenMode } from "../../remoteOpen";

/** Marks the visible picker button for the global open-favorite shortcut. */
export const OPEN_FAVORITE_EDITOR_ATTRIBUTE = "data-open-favorite-editor";

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly remoteOpenMode: RemoteOpenMode;
}): boolean {
  if (!input.activeProjectName) return false;
  if (
    input.primaryEnvironmentId !== null &&
    input.activeThreadEnvironmentId === input.primaryEnvironmentId
  ) {
    return true;
  }
  return input.remoteOpenMode !== "local-exec";
}
