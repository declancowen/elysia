import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  ComposerContextId,
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  defaultInstanceIdForDriver,
  type EnvironmentId,
  type ProjectId,
  type ThreadId,
  type WorkspaceChatTarget,
} from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";
import { getDefaultServerModel } from "../providerModels";
import { ElysiaIcon } from "./Icons";
import { useRegularProjects } from "../hooks/useRegularProjects";
import { newDraftId, newThreadId } from "../lib/utils";
import {
  finalizePromotedDraftThreadByRef,
  useComposerDraftStore,
  type DraftId,
} from "../composerDraftStore";
import { useThreadShells, waitForProject, waitForThreadShell } from "../state/entities";
import { projectEnvironment } from "../state/projects";
import { serverEnvironment, environmentServerConfigsAtom } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { Maximize2Icon, Minimize2Icon, MinusIcon, PlusIcon, MessageCircleIcon } from "../icons";
import { Button } from "./ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "./ui/menu";
const ChatView = lazy(() => import("./ChatView"));

/** Both document surfaces embed the ordinary conversation, never an agent/channel chat. */
export function useWorkspaceSideChat({
  environmentId,
  target,
  title,
  projectId,
  onOpen,
}: {
  environmentId: EnvironmentId | null;
  target: WorkspaceChatTarget | null;
  title: string;
  projectId: ProjectId | null;
  onOpen: () => void;
}) {
  const query = useEnvironmentQuery(
    environmentId && target
      ? serverEnvironment.workspaceChats({ environmentId, input: target })
      : null,
  );
  const link = useAtomCommand(serverEnvironment.linkWorkspaceChat, { reportFailure: false });
  const ensureScratch = useAtomCommand(projectEnvironment.ensureScratch, { reportFailure: false });
  const projects = useRegularProjects();
  const shells = useThreadShells();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<ThreadId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: ThreadId; draftId: DraftId } | null>(null);
  const targetKey = target ? `${environmentId}:${target.kind}:${target.id}` : "";
  const currentTargetKey = useRef(targetKey);
  useLayoutEffect(() => {
    currentTargetKey.current = targetKey;
  }, [targetKey]);
  useEffect(() => {
    setOpen(false);
    setExpanded(false);
    setSelected(null);
    setError(null);
    setDraft(null);
  }, [targetKey]);
  const chats = shells.filter(
    (thread) =>
      thread.environmentId === environmentId &&
      query.data?.threadIds.includes(thread.id) &&
      thread.archivedAt === null &&
      projects.some(
        (project) => project.environmentId === environmentId && project.id === thread.projectId,
      ),
  );
  const ready = query.data !== null && query.error === null;
  const pendingDraft =
    draft &&
    !chats.some((chat) => chat.id === draft.id) &&
    !shells.some(
      (thread) =>
        thread.environmentId === environmentId &&
        thread.id === draft.id &&
        thread.archivedAt !== null,
    )
      ? draft
      : null;
  const active =
    pendingDraft?.id === selected
      ? shells.find(
          (thread) =>
            thread.environmentId === environmentId &&
            thread.id === selected &&
            thread.archivedAt === null,
        )
      : (chats.find((thread) => thread.id === selected) ?? chats.at(-1));
  const activeId = pendingDraft?.id === selected ? pendingDraft.id : active?.id;
  const show = (id: ThreadId) => {
    if (target && environmentId) {
      const ref = scopeThreadRef(environmentId, id);
      const store = useComposerDraftStore.getState();
      const prompt = store.getComposerDraft(ref)?.prompt ?? "";
      const reference = formatComposerContextReference({
        kind: target.kind,
        contextId: ComposerContextId.make(target.id),
        label: title,
      });
      if (prompt.includes(reference))
        store.setPrompt(ref, prompt.replace(reference, "").trimStart());
    }
    setSelected(id);
    onOpen();
    setOpen(true);
  };
  const start = async () => {
    if (!target || !environmentId || busy) return;
    const key = targetKey;
    setBusy(true);
    setError(null);
    try {
      let destination = projects.find(
        (project) => project.environmentId === environmentId && project.id === projectId,
      );
      if (projectId && !destination) throw new Error("The linked project is no longer available.");
      if (!destination) {
        const result = await ensureScratch({ environmentId, input: {} });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        destination =
          (await waitForProject(scopeProjectRef(environmentId, result.value.projectId))) ??
          undefined;
      }
      if (!destination) throw new Error("Could not open the chat workspace.");
      const settings = resolveProjectSettings(
        configs.get(environmentId)?.settings ?? DEFAULT_SERVER_SETTINGS,
        destination.id,
        destination,
      ).settings;
      if (currentTargetKey.current !== key) return;
      const id = newThreadId();
      const draftId = newDraftId();
      const store = useComposerDraftStore.getState();
      // A document draft must not replace another draft in the same project.
      store.setLogicalProjectDraftThreadId(
        `workspace:${key}:${id}`,
        scopeProjectRef(environmentId, destination.id),
        draftId,
        {
          threadId: id,
          runtimeMode: settings.defaultRuntimeMode,
          interactionMode: "default",
          envMode: "local",
        },
      );
      store.setModelSelection(
        draftId,
        settings.defaultModelSelection ?? {
          instanceId: defaultInstanceIdForDriver(ProviderDriverKind.make("claudeAgent")),
          model: getDefaultServerModel(
            configs.get(environmentId)?.providers ?? [],
            ProviderDriverKind.make("claudeAgent"),
          ),
        },
      );
      setDraft({ id, draftId });
      show(id);
    } catch (cause) {
      if (currentTargetKey.current === key)
        setError(cause instanceof Error ? cause.message : "Could not open chat.");
    } finally {
      setBusy(false);
    }
  };
  const controls = (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost-muted"
              size="icon-sm"
              aria-label="Linked chats"
              disabled={busy || !ready}
            />
          }
        >
          <MessageCircleIcon />
        </MenuTrigger>
        <MenuPopup align="end">
          {chats.map((chat) => (
            <MenuItem key={chat.id} onClick={() => show(chat.id)}>
              {chat.title}
            </MenuItem>
          ))}
          {chats.length ? <MenuSeparator /> : null}
          <MenuItem onClick={() => void start()} disabled={busy || !ready}>
            <PlusIcon />
            New chat
          </MenuItem>
        </MenuPopup>
      </Menu>
      <Button
        variant="ghost-muted"
        size="icon-sm"
        aria-label="New linked chat"
        disabled={busy || !ready}
        onClick={() => void start()}
      >
        <PlusIcon />
      </Button>
    </>
  );
  const prepare = async (id: ThreadId, draftProjectId: ProjectId) => {
    if (!target || !environmentId) return;
    const result = await link({
      environmentId,
      input: { target, threadId: id, linked: true, draftProjectId },
    });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  };
  const started = async (id: ThreadId) => {
    if (!target || !environmentId) return;
    const key = targetKey;
    await waitForThreadShell(scopeThreadRef(environmentId, id));
    finalizePromotedDraftThreadByRef(scopeThreadRef(environmentId, id));
    if (currentTargetKey.current !== key) return;
    setSelected(id);
    query.refresh();
  };
  const panel = target ? (
    <>
      {error || query.error ? (
        <div
          role="alert"
          className="absolute right-6 bottom-20 z-30 max-w-sm rounded-lg bg-popover p-3 text-sm text-destructive"
        >
          {error ?? query.error}
          <Button
            variant="ghost-muted"
            size="sm"
            onClick={() => (query.error ? query.refresh() : void start())}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {open && activeId && environmentId ? (
        <section
          aria-label="Side chat"
          className="floating-panel-glass absolute right-6 bottom-6 z-30 flex min-h-0 flex-col overflow-hidden rounded-3xl workspace-panel-outline [--chat-content-max-width:100%] [&_.messages-timeline-scroll]:px-4!"
          style={{
            width: expanded ? "calc(100% - 3rem)" : "min(480px, calc(100% - 3rem))",
            height: expanded ? "calc(100% - 3rem)" : "min(640px, calc(100% - 6rem))",
          }}
        >
          <header className="flex shrink-0 items-center gap-2 p-4">
            <Button
              variant="ghost-muted"
              size="icon-sm"
              aria-label="Minimise side chat"
              onClick={() => setOpen(false)}
            >
              <MinusIcon />
            </Button>
            <span className="min-w-0 flex-1 truncate text-sm">{active?.title ?? "New chat"}</span>
            {controls}
            <Button
              variant="ghost-muted"
              size="icon-sm"
              aria-label={expanded ? "Normal side chat" : "Expand side chat"}
              aria-pressed={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
            </Button>
          </header>
          <Suspense
            fallback={
              <p role="status" className="p-4 text-sm">
                Loading chat…
              </p>
            }
          >
            <ChatView
              key={activeId}
              environmentId={environmentId}
              threadId={activeId}
              {...(pendingDraft?.id === activeId
                ? ({ routeKind: "draft", draftId: pendingDraft.draftId } as const)
                : ({ routeKind: "server" } as const))}
              {...(pendingDraft?.id === activeId
                ? { onBeforeThreadStarted: prepare, onThreadStarted: started }
                : {})}
              embedded
              workspaceContext={{ ...target, label: title }}
            />
          </Suspense>
        </section>
      ) : (
        <div className="absolute right-6 bottom-6 z-20">
          <Button
            variant="floating"
            size="icon-xl"
            aria-label="Open side chat"
            disabled={busy || !ready}
            onClick={() => (activeId ? show(activeId) : void start())}
          >
            <ElysiaIcon aria-hidden />
          </Button>
        </div>
      )}
    </>
  ) : null;
  return { panel, close: () => setOpen(false) };
}
