import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { useMemo } from "react";

import { ChevronRightIcon, FileIcon, Files, FolderIcon, ImageIcon, PlusIcon } from "lucide-react";
import {
  isFileAttachment,
  isImageAttachment,
  isVideoAttachment,
  type ChatAttachment,
  type ChatFileAttachment,
  type ChatImageAttachment,
  type ChatMessage,
} from "~/types";

import { FileSurfaceAction } from "./files/fileSurfaceChrome";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { uploadedSources } from "./uploadedSources";

function sourceKind(attachment: ChatAttachment): string {
  if (isImageAttachment(attachment)) return "Image";
  if (isFileAttachment(attachment)) return isVideoAttachment(attachment) ? "Video" : "File";
  return attachment.type === "folder" ? "Folder" : "Source";
}

export function UploadedSourcesPanel(props: {
  messages: ReadonlyArray<ChatMessage>;
  onOpenAttachment: (attachment: ChatImageAttachment | ChatFileAttachment) => void;
  onUpload?: () => void;
}) {
  const sources = useMemo(() => uploadedSources(props.messages), [props.messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <span className="flex-1 text-xs text-muted-foreground">
          {sources.length} {sources.length === 1 ? "source" : "sources"} uploaded to this thread
        </span>
        {props.onUpload ? (
          <FileSurfaceAction label="Upload sources" onPress={props.onUpload}>
            <PlusIcon className="size-3.5" />
          </FileSurfaceAction>
        ) : null}
      </div>
      {sources.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Files aria-hidden className="size-6 text-muted-foreground/60" />
          <p className="text-sm font-medium">No sources yet</p>
          <p className="max-w-64 text-xs leading-relaxed text-muted-foreground">
            Files and images you upload to this thread will appear here.
          </p>
          {props.onUpload ? (
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={props.onUpload}>
                <PlusIcon aria-hidden />
                Upload sources
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1" viewportTabIndex={-1}>
          <ul aria-label="Uploaded sources" className="space-y-1 p-2">
            {sources.map((attachment) => {
              const image = isImageAttachment(attachment);
              const file = isFileAttachment(attachment);
              const unavailable =
                !image &&
                (!file ||
                  (attachment.downloadable === false &&
                    (!isVideoAttachment(attachment) || attachment.previewUrl === undefined)));
              const Icon = image ? ImageIcon : attachment.type === "folder" ? FolderIcon : FileIcon;
              const content = (
                <>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{attachment.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {sourceKind(attachment)} · {formatAttachmentSize(attachment.sizeBytes)}
                      {unavailable ? " · Preview unavailable" : ""}
                    </span>
                  </span>
                  {unavailable ? null : (
                    <ChevronRightIcon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  )}
                </>
              );
              return (
                <li key={attachment.id}>
                  {unavailable || (!image && !file) ? (
                    <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">{content}</div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Open ${attachment.name}`}
                      onClick={() => props.onOpenAttachment(attachment)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
