import type { ServerUpdateState } from "@elysiatools/client-runtime/state/server";
import { CircleAlertIcon, DownloadIcon } from "~/icons";

// Static on purpose: the title says when an update is running, and spinners repaint every frame.
export function ComposerServerUpdateIcon({
  status,
}: {
  readonly status: ServerUpdateState["status"];
}) {
  if (status === "failed") {
    return <CircleAlertIcon aria-hidden />;
  }
  return <DownloadIcon aria-hidden />;
}
