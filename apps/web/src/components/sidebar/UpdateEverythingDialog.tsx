import { useAtomValue } from "@effect/atom-react";
import { EnvironmentId } from "@elysiatools/contracts";
import { Atom } from "effect/reactivity";
import { ChevronRightIcon } from "~/icons";
import { type RefObject, useRef } from "react";

import { APP_DISPLAY_NAME } from "~/branding";
import { environmentThreadShells } from "~/state/threads";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { ScrollArea } from "../ui/scroll-area";
import type { RestartingMachine, UpdateEverythingRow } from "./updateEverything.logic";

const isRunning = (status: string) =>
  status === "preparing" || status === "starting" || status === "running";

const runningThreadCountAtom = Atom.family((environmentIds: string) =>
  Atom.make((get) =>
    environmentIds
      .split("\n")
      .filter((id) => id !== "")
      .reduce(
        (count, id) =>
          count +
          get(environmentThreadShells.environmentThreadsAtom(EnvironmentId.make(id))).filter(
            (thread) => isRunning(thread.status),
          ).length,
        0,
      ),
  ).pipe(Atom.withLabel(`update-everything-running-threads:${environmentIds}`)),
);

interface UpdateEverythingDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly version: string | null;
  readonly providerCount: number;
  readonly rows: ReadonlyArray<UpdateEverythingRow>;
  readonly restarts: ReadonlyArray<RestartingMachine>;
  readonly onConfirm: () => void;
  /** Overrides the title for an update-track switch. */
  readonly title?: string;
  readonly confirmLabel?: string;
  readonly notes?: ReadonlyArray<string>;
  /** Shown in place of running-thread counts; disables the confirm button. */
  readonly disabledReason?: string | null;
  /** The confirmed work is starting; it cannot be cancelled from here. */
  readonly busy?: boolean;
}

type UpdateEverythingDialogContentProps = Omit<
  UpdateEverythingDialogProps,
  "open" | "onOpenChange"
> & {
  readonly cancelRef: RefObject<HTMLButtonElement | null>;
};

export function UpdateEverythingDialog({
  open,
  onOpenChange,
  ...content
}: UpdateEverythingDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Refocusing the trigger after a pointer close shows its focus ring and opens its tooltip. */}
      <AlertDialogPopup
        className="sm:max-w-xl"
        initialFocus={cancelRef}
        finalFocus={(closeType) => closeType === "keyboard"}
      >
        <UpdateEverythingDialogContent {...content} cancelRef={cancelRef} />
      </AlertDialogPopup>
    </AlertDialog>
  );
}

const APP_LABELS = {
  "this-app": "Restarts last",
  server: "Server",
  "desktop-app": "Desktop app",
} as const;

function UpdateEverythingDialogContent({
  version,
  providerCount,
  rows,
  restarts,
  onConfirm,
  cancelRef,
  title,
  confirmLabel = "Update",
  notes = [],
  disabledReason = null,
  busy = false,
}: UpdateEverythingDialogContentProps) {
  const stopped = useAtomValue(
    runningThreadCountAtom(
      restarts
        .filter((machine) => !machine.continuesThreads)
        .map((machine) => machine.environmentId)
        .join("\n"),
    ),
  );
  const continuing = useAtomValue(
    runningThreadCountAtom(
      restarts
        .filter((machine) => machine.continuesThreads)
        .map((machine) => machine.environmentId)
        .join("\n"),
    ),
  );
  const running = stopped + continuing;
  const threads = `${running} running ${running === 1 ? "thread" : "threads"}`;
  const restarting = new Set(restarts.map((machine) => machine.environmentId));
  const updating = rows.filter((row) => row.app !== null || row.providers.length > 0);
  const skipped = rows.filter((row) => row.skipped !== null);
  const summary = [
    version !== null ? `${APP_DISPLAY_NAME} ${version}` : null,
    providerCount > 0
      ? `${providerCount} provider ${providerCount === 1 ? "update" : "updates"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <AlertDialogHeader className="shrink-0">
        <AlertDialogTitle>
          {title ??
            (version !== null ? `Update ${APP_DISPLAY_NAME}?` : "Install provider updates?")}
        </AlertDialogTitle>
        <AlertDialogDescription>
          <span className="block overflow-x-auto whitespace-nowrap">{summary}</span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <ScrollArea scrollFade>
        <div className="flex flex-col gap-3 px-6 pb-4">
          {notes.map((note) => (
            <p key={note} className="text-muted-foreground text-sm">
              {note}
            </p>
          ))}
          <div className="grid grid-cols-[max-content_minmax(0,1fr)_max-content] gap-x-4 text-sm">
            <div className="col-span-full grid grid-cols-subgrid border-b pb-1.5 text-muted-foreground text-xs">
              <span>{APP_DISPLAY_NAME}</span>
              <span>Providers</span>
              <span />
            </div>
            {updating.map((row) => (
              <div
                key={row.environmentId ?? "this-app"}
                className="col-span-full grid grid-cols-subgrid border-b border-border/50 py-1.5 last:border-b-0"
              >
                <span className="whitespace-nowrap">
                  {row.app !== null ? APP_LABELS[row.app] : null}
                  {row.app === null && row.skipped !== null ? (
                    <span className="text-muted-foreground">Skipped</span>
                  ) : null}
                </span>
                <span className="overflow-x-auto whitespace-nowrap">
                  {row.providers.join(", ")}
                </span>
                <span className="text-right">
                  {row.environmentId !== null && restarting.has(row.environmentId) ? (
                    <RunningThreads environmentId={row.environmentId} />
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          {skipped.length > 0 ? (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground data-panel-open:[&_svg]:rotate-90">
                <ChevronRightIcon className="size-3.5 transition-transform" aria-hidden />
                {skipped.length} skipped
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="grid gap-y-0.5 pt-1.5 ps-4.5 text-muted-foreground text-xs">
                  {skipped.map((row) => (
                    <span key={row.environmentId ?? "this-app"} className="wrap-anywhere">
                      {row.skipped}
                    </span>
                  ))}
                </div>
              </CollapsiblePanel>
            </Collapsible>
          ) : null}
        </div>
      </ScrollArea>
      <AlertDialogFooter>
        {disabledReason !== null ? (
          <p className="self-center text-sm max-sm:order-1 max-sm:text-center sm:mr-auto">
            {disabledReason}
          </p>
        ) : running > 0 ? (
          <p className="self-center text-muted-foreground text-sm max-sm:order-1 max-sm:text-center sm:mr-auto">
            {stopped === 0
              ? `${threads} will be interrupted and can resume after the restart.`
              : continuing === 0
                ? `${threads} will be interrupted.`
                : `${threads} will be interrupted. ${continuing} can resume after the restart.`}
          </p>
        ) : null}
        <AlertDialogClose ref={cancelRef} render={<Button variant="outline" disabled={busy} />}>
          Cancel
        </AlertDialogClose>
        <Button disabled={disabledReason !== null || busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

function RunningThreads({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const count = useAtomValue(runningThreadCountAtom(environmentId));
  return count > 0 ? <span className="whitespace-nowrap text-warning">{count} running</span> : null;
}
