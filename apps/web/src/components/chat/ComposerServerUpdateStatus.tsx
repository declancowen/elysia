import { Spinner } from "~/components/ui/spinner";
import type { ServerUpdateState } from "@elysiatools/client-runtime/state/server";
import { CircleAlertIcon, DownloadIcon } from "~/icons";

export function ComposerServerUpdateIcon({
  status,
}: {
  readonly status: ServerUpdateState["status"];
}) {
  if (status === "running") {
    return <Spinner aria-hidden />;
  }
  if (status === "failed") {
    return <CircleAlertIcon aria-hidden />;
  }
  return <DownloadIcon aria-hidden />;
}
