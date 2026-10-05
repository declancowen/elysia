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
import { newThreadId } from "../lib/utils";
import { useComposerDraftStore } from "../composerDraftStore";
import { useThreadShells, waitForProject, waitForThreadShell } from "../state/entities";
import { projectEnvironment } from "../state/projects";
import { serverEnvironment, environmentServerConfigsAtom } from "../state/server";
import { threadEnvironment } from "../state/threads";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { Maximize2Icon, Minimize2Icon, MinusIcon, PlusIcon } from "../icons";
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
  const create = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const ensureScratch = useAtomCommand(projectEnvironment.ensureScratch, { reportFailure: false });
  const projects = useRegularProjects();
  const shells = useThreadShells();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<ThreadId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingThread = useRef<{ key: string; id: ThreadId } | null>(null);
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
    pendingThread.current = null;
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
  const active = chats.find((thread) => thread.id === selected) ?? chats.at(-1);
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
      const pending = pendingThread.current?.key === key ? pendingThread.current : null;
      const id = pending?.id ?? newThreadId();
      if (!pending) {
        const result = await create({
          environmentId,
          input: {
            threadId: id,
            projectId: destination.id,
            title: `${title || "New chat"} · Chat ${chats.length + 1}`,
            modelSelection: settings.defaultModelSelection ?? {
              instanceId: defaultInstanceIdForDriver(ProviderDriverKind.make("claudeAgent")),
              model: getDefaultServerModel(
                configs.get(environmentId)?.providers ?? [],
                ProviderDriverKind.make("claudeAgent"),
              ),
            },
            runtimeMode: settings.defaultRuntimeMode,
            interactionMode: "default",
            branch: null,
            worktreePath: null,
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        if (currentTargetKey.current === key) pendingThread.current = { key, id };
      }
      const linked = await link({ environmentId, input: { target, threadId: id, linked: true } });
      if (linked._tag === "Failure") throw squashAtomCommandFailure(linked);
      await waitForThreadShell(scopeThreadRef(environmentId, id));
      if (currentTargetKey.current !== key) return;
      pendingThread.current = null;
      query.refresh();
      show(id);
    } catch (cause) {
      if (currentTargetKey.current === key)
        setError(cause instanceof Error ? cause.message : "Could not open chat.");
    } finally {
      setBusy(false);
    }
  };
  const controls = target ? (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost-muted"
            size="sm"
            aria-label="Linked chats"
            disabled={busy || !ready}
          />
        }
      >
        <ElysiaIcon aria-hidden className="size-4" />
        Chats
      </MenuTrigger>
      <MenuPopup align="end">
        {chats.map((chat) => (
          <MenuItem key={chat.id} onClick={() => show(chat.id)}>
            <ElysiaIcon aria-hidden className="size-4" />
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
  ) : null;
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
      {open && active && environmentId ? (
        <section
          aria-label="Side chat"
          className="floating-panel-glass absolute right-6 bottom-6 z-30 flex min-h-0 flex-col overflow-hidden rounded-3xl workspace-panel-outline [&_.messages-timeline-scroll]:px-4!"
          style={{
            width: expanded ? "min(900px, calc(100% - 3rem))" : "min(480px, calc(100% - 3rem))",
            height: expanded ? "calc(100% - 6rem)" : "min(640px, calc(100% - 6rem))",
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
            <span className="min-w-0 flex-1 truncate text-sm">{active.title}</span>
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
              key={active.id}
              environmentId={environmentId}
              threadId={active.id}
              routeKind="server"
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
            onClick={() => (active ? show(active.id) : void start())}
          >
            <ElysiaIcon aria-hidden />
          </Button>
        </div>
      )}
    </>
  ) : null;
  return { controls, panel, close: () => setOpen(false) };
}
