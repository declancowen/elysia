import { useState } from "react";
import type { EnvironmentId } from "@elysiatools/contracts";
import { filesystemEnvironment } from "../../state/filesystem";
import { useEnvironmentQuery } from "../../state/query";
import { FolderIcon, ArrowLeftIcon } from "../../icons";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";

/** Browse the server filesystem, just like Add project, including remote clients. */
export function ChannelFolderPicker({
  environmentId,
  initialPath,
  onChoose,
  onClose,
}: {
  environmentId: EnvironmentId;
  initialPath: string;
  onChoose: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(initialPath ? `${initialPath.replace(/[\\/]+$/, "")}/` : "~/");
  const browse = useEnvironmentQuery(
    filesystemEnvironment.browse({
      environmentId,
      input: { partialPath: `${(path.trim() || "~").replace(/[\\/]+$/, "")}/` },
    }),
  );
  const directory = browse.data?.parentPath;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Link folder</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Parent folder"
                disabled={!directory}
                onClick={() => setPath(`${directory!.replace(/[\\/][^\\/]+[\\/]?$/, "") || "/"}/`)}
              >
                <ArrowLeftIcon />
              </Button>
              <Input aria-label="Folder path" value={path} onValueChange={setPath} />
            </div>
            {browse.error ? (
              <p role="alert" className="text-sm text-destructive">
                {browse.error}
              </p>
            ) : null}
            <div className="h-64">
              <ScrollArea>
                {browse.data?.entries.map((entry) => (
                  <button
                    key={entry.fullPath}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setPath(`${entry.fullPath}/`)}
                  >
                    <FolderIcon className="size-4 shrink-0" />
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
                {browse.isPending ? (
                  <p className="p-3 text-sm text-muted-foreground">Loading folders…</p>
                ) : null}
              </ScrollArea>
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!directory || browse.isPending || !!browse.error}
            onClick={() => {
              if (directory) {
                onChoose(directory);
                onClose();
              }
            }}
          >
            Link this folder
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
