import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PageId, ProjectId, type EnvironmentId, type Page } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useRegularProjects } from "../../hooks/useRegularProjects";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ArrowLeftIcon, PanelRightIcon, Trash2Icon } from "../../icons";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { useWorkspaceSideChat } from "../WorkspaceSideChat";
import { WorkspaceSurfaceHeader } from "../WorkspaceSurfaceHeader";
import { WorkspaceDetailsPanel } from "../WorkspaceDetailsPanel";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { Menu, MenuTrigger, MenuPopup, MenuRadioGroup, MenuRadioItem } from "../ui/menu";
import {
  pageHasUnsavedChanges,
  canAdoptPageSnapshot,
  reconcilePageSave,
  readPageCanvasWidth,
  writePageCanvasWidth,
} from "./PageDetailPage.logic";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "../ui/alert-dialog";
import { WorkspaceRichTextEditor } from "../WorkspaceRichTextEditor";

export function PageDetailPage({ pageId }: { readonly pageId: string }) {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId ? (
    <PageDetail key={`${environmentId}:${pageId}`} environmentId={environmentId} pageId={pageId} />
  ) : (
    <SidebarInset variant="standalone">
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Connecting…
      </p>
    </SidebarInset>
  );
}
function PageDetail({
  environmentId,
  pageId,
}: {
  readonly environmentId: EnvironmentId;
  readonly pageId: string;
}) {
  const validId = /^page-[0-9a-f-]{36}$/.test(pageId);
  const query = useEnvironmentQuery(
    validId ? serverEnvironment.page({ environmentId, input: { id: PageId.make(pageId) } }) : null,
  );
  const live = useEnvironmentQuery(serverEnvironment.pagesLive({ environmentId, input: {} }));
  const source = query.data?.page;
  const [saved, setSaved] = useState<Page | null>(null);
  const [draft, setDraft] = useState<Page | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sideChat = useWorkspaceSideChat({
    environmentId,
    target: saved ? { kind: "page", id: saved.id } : null,
    title: draft?.title ?? saved?.title ?? "",
    projectId: saved?.projectId ?? null,
    onOpen: () => setPanelOpen(false),
  });
  const submitting = useRef(false);
  const detailsAnchor = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(() =>
    readPageCanvasWidth(typeof window === "undefined" ? undefined : window.localStorage),
  );
  const leaving = useRef(false);
  const savePage = useAtomCommand(serverEnvironment.savePage);
  const deletePage = useAtomCommand(serverEnvironment.deletePage);
  const navigate = useNavigate();
  const allProjects = useRegularProjects();
  const projects = allProjects.filter((project) => project.environmentId === environmentId);
  const latest = useRef({ draft, saved, removed: false, newer: false });
  const inFlight = useRef<Promise<boolean> | null>(null);
  const dirty = pageHasUnsavedChanges(draft, saved);
  const summary = live.data?.pages.find((page) => page.id === pageId);
  const removed = Boolean(live.data && !summary);
  const newer = Boolean(saved && summary && summary.revision > saved.revision);
  useLayoutEffect(() => {
    latest.current = { draft, saved, removed, newer };
  }, [draft, saved, removed, newer]);
  if (source && canAdoptPageSnapshot(source, summary, saved, dirty)) {
    setSaved(source);
    setDraft(source);
  }
  const refresh = query.refresh;
  useEffect(() => {
    if (summary && (!source || source.revision < summary.revision)) refresh();
  }, [summary, source, refresh]);
  const save = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const {
      draft: submitted,
      saved: baseline,
      removed: deleted,
      newer: conflicted,
    } = latest.current;
    if (
      !submitted ||
      !baseline ||
      !submitted.title.trim() ||
      submitting.current ||
      deleted ||
      conflicted
    )
      return Promise.resolve(false);
    submitting.current = true;
    setPending(true);
    setError(null);
    const operation = (async () => {
      const result = await savePage({
        environmentId,
        input: {
          id: submitted.id,
          expectedRevision: baseline.revision,
          title: submitted.title.trim(),
          content: submitted.content,
          projectId: submitted.projectId,
        },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) setError(String(squashAtomCommandFailure(result)));
        return false;
      }
      const reconciled = reconcilePageSave(latest.current.draft, submitted, result.value.page);
      latest.current.saved = result.value.page;
      latest.current.draft = reconciled;
      setSaved(result.value.page);
      setDraft(reconciled);
      return true;
    })();
    inFlight.current = operation.finally(() => {
      submitting.current = false;
      inFlight.current = null;
      setPending(false);
    });
    return inFlight.current;
  }, [savePage, environmentId]);
  useBlocker({
    withResolver: false,
    shouldBlockFn: async () => {
      if (leaving.current || !pageHasUnsavedChanges(latest.current.draft, latest.current.saved))
        return false;
      while (pageHasUnsavedChanges(latest.current.draft, latest.current.saved)) {
        if (!(await save())) {
          setError(
            (current) =>
              current ??
              "Your changes could not be saved. Stay on this page and retry after resolving the issue.",
          );
          return true;
        }
      }
      return false;
    },
    enableBeforeUnload: () =>
      pageHasUnsavedChanges(latest.current.draft, latest.current.saved) && !leaving.current,
  });
  useEffect(() => {
    if (!dirty || pending || error || newer || removed || deleteOpen || !draft?.title.trim())
      return;
    const timer = window.setTimeout(() => {
      void save();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [dirty, pending, error, newer, removed, deleteOpen, draft, save]);
  const remove = async () => {
    if (!saved || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    const result = await deletePage({ environmentId, input: { id: saved.id } });
    submitting.current = false;
    setPending(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) setError(String(squashAtomCommandFailure(result)));
      return;
    }
    leaving.current = true;
    void navigate({ to: "/pages" });
  };
  const reload = () => {
    setDraft(saved);
    setReloadOpen(false);
    setError(null);
    query.refresh();
  };
  return (
    <SidebarInset variant="standalone" className="min-h-0 overflow-hidden">
      <WorkspaceSurfaceHeader
        divider={false}
        title={
          <Button
            variant="ghost-muted"
            onClick={() => {
              void navigate({ to: "/pages" });
            }}
          >
            <ArrowLeftIcon />
            Pages
          </Button>
        }
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {sideChat.controls}
            <span role="status" className="text-xs text-muted-foreground">
              {pending
                ? "Saving…"
                : error || (newer && dirty)
                  ? "Not saved"
                  : dirty
                    ? "Waiting to save…"
                    : saved
                      ? "Saved"
                      : ""}
            </span>
            <Menu>
              <MenuTrigger
                render={<Button variant="ghost-muted" size="sm" />}
                aria-label="Page canvas width"
              >
                {width === "surface" ? "Full width" : "Centered"}
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuRadioGroup
                  value={width}
                  onValueChange={(value) => {
                    if (value !== "readable" && value !== "surface") return;
                    setWidth(value);
                    writePageCanvasWidth(
                      value,
                      typeof window === "undefined" ? undefined : window.localStorage,
                    );
                  }}
                >
                  <MenuRadioItem value="readable">Centered</MenuRadioItem>
                  <MenuRadioItem value="surface">Full width</MenuRadioItem>
                </MenuRadioGroup>
              </MenuPopup>
            </Menu>
            <Button
              variant="ghost-muted"
              size="icon"
              aria-label="Page details"
              aria-expanded={panelOpen}
              ref={detailsAnchor}
              onClick={() => {
                sideChat.close();
                setPanelOpen((open) => !open);
              }}
              disabled={!saved}
            >
              <PanelRightIcon />
            </Button>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 items-start gap-5 overflow-y-auto px-5 pb-5">
        <div className="min-w-0 flex-1">
          {!validId || ((query.error || removed) && !draft) ? (
            <p role="alert" className="p-6 text-sm text-destructive">
              {query.error ?? "Page not found."}
            </p>
          ) : !draft ? (
            <p role="status" className="p-6 text-sm text-muted-foreground">
              Loading page…
            </p>
          ) : (
            <WorkspacePageContainer width={width}>
              {removed ? (
                <p role="alert" className="text-sm text-destructive">
                  This page was deleted. Your unsaved content is still visible here.
                </p>
              ) : newer && dirty ? (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                >
                  <span>This page has newer edits. Your draft has been preserved.</span>
                  <Button size="sm" variant="outline" onClick={() => setReloadOpen(true)}>
                    Reload latest
                  </Button>
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      void save();
                    }}
                  >
                    Retry save
                  </Button>
                </p>
              ) : null}
              <div className="text-3xl font-medium">
                <input
                  type="text"
                  className="w-full min-w-0 rounded-sm bg-transparent text-3xl font-medium text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  aria-label="Page title"
                  placeholder="Page title"
                  maxLength={200}
                  disabled={removed}
                  value={draft.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    setDraft((current) => (current ? { ...current, title } : current));
                  }}
                />
              </div>
              <WorkspaceRichTextEditor
                value={draft.content}
                onChange={(content) =>
                  setDraft((current) => (current ? { ...current, content } : current))
                }
                disabled={removed}
              />
            </WorkspacePageContainer>
          )}
        </div>
        <WorkspaceDetailsPanel
          label="Page details"
          open={panelOpen}
          onOpenChange={setPanelOpen}
          anchor={detailsAnchor}
        >
          <h2 className="mb-5 text-base font-medium">Page details</h2>
          {draft ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label id="page-project-label" className="text-sm">
                  Project
                </label>
                <Select
                  value={
                    projects.some((project) => project.id === draft.projectId)
                      ? draft.projectId
                      : "none"
                  }
                  disabled={removed}
                  onValueChange={(value) => {
                    if (value)
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              projectId: value === "none" ? null : ProjectId.make(value),
                            }
                          : current,
                      );
                  }}
                >
                  <SelectTrigger aria-labelledby="page-project-label">
                    <SelectValue>
                      {projects.find((project) => project.id === draft.projectId)?.title ??
                        "No Project"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    <SelectItem value="none">No Project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="mt-1">{new Date(draft.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="mt-1">
                    {new Date(saved?.updatedAt ?? draft.updatedAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-col">
                <Button
                  variant="outline"
                  disabled={pending || removed}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2Icon />
                  Delete page
                </Button>
              </div>
            </div>
          ) : null}
        </WorkspaceDetailsPanel>
      </div>
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!pending) setDeleteOpen(open);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete page?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes this page and its content from Elysia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                void remove();
              }}
            >
              {pending ? "Deleting…" : "Delete page"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <AlertDialog open={reloadOpen} onOpenChange={setReloadOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Reload this page?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved edits will be replaced by the latest saved version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setReloadOpen(false)}>
              Keep editing
            </Button>
            <Button variant="outline" onClick={reload}>
              Reload latest
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      {sideChat.panel}
    </SidebarInset>
  );
}
