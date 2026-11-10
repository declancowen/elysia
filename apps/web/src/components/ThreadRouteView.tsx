import { scopeProjectRef, scopedThreadKey } from "@elysiatools/client-runtime/environment";
import type { ScopedThreadRef } from "@elysiatools/contracts";
import { SINGLE_PROVIDER_UI } from "@elysiatools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ChatView from "./ChatView";
import { useConversationTabNavigation } from "../hooks/useConversationTabNavigation";
import { currentConversationTabsStore } from "../conversationTabsStore";
import { BackgroundThreadContext } from "./chat/backgroundThread";
import { SidebarInset } from "./ui/sidebar";
import { useComposerDraftStore } from "../composerDraftStore";
import { useSidebarPendingFileDropStore } from "../sidebarPendingFileDropStore";
import { useEnvironmentThreadRefs, useQuietThreadShell, useProject } from "../state/entities";
import { useEnvironmentShellStatus } from "../state/shell";
import { useEnvironmentThread } from "../state/threads";
import {
  buildThreadRouteParams,
  isThreadRouteSnapshotAuthoritative,
  resolveThreadRouteRenderState,
  type ThreadRouteTarget,
} from "../threadRoutes";

/**
 * Render in the shared layout to retain ChatView across route swaps; plain server threads remain unkeyed.
 * `background` keeps the thread mounted but hidden while Settings or Usage owns the surface.
 */
export function ThreadRouteView({
  target,
  background = false,
}: {
  target: ThreadRouteTarget;
  background?: boolean;
}) {
  const navigate = useNavigate();
  const navigateTab = useConversationTabNavigation();
  const draftId = target.kind === "draft" ? target.draftId : null;
  const draftSession = useComposerDraftStore((store) =>
    draftId === null ? null : store.getDraftSession(draftId),
  );
  const draftRedirect = useComposerDraftStore((store) =>
    draftId !== null && draftSession === null ? store.getPromotedDraftRedirect(draftId) : null,
  );
  const serverThreadRef: ScopedThreadRef | null =
    target.kind === "server" ? target.threadRef : draftRedirect;
  const serverThreadShell = useQuietThreadShell(serverThreadRef);
  const project = useProject(
    serverThreadRef && serverThreadShell
      ? scopeProjectRef(serverThreadRef.environmentId, serverThreadShell.projectId)
      : null,
  );
  const archived =
    serverThreadShell?.archivedAt != null || project?.agentProfile?.archived === true;
  const shellStatus = useEnvironmentShellStatus(serverThreadRef?.environmentId ?? null);
  const environmentThreadRefs = useEnvironmentThreadRefs(serverThreadRef?.environmentId ?? null);
  const bootstrapComplete = isThreadRouteSnapshotAuthoritative(shellStatus);
  const draftThread = useComposerDraftStore((store) =>
    serverThreadRef ? store.getDraftThreadByRef(serverThreadRef) : null,
  );
  const promotedDraftId = useComposerDraftStore((store) =>
    target.kind === "server" ? store.getDraftIdByRef(target.threadRef) : null,
  );
  // Keep the composer mounted while the finalized draft redirects to its thread.
  const [chatViewKey, setChatViewKey] = useState<{
    threadKey: string;
    key: string;
  } | null>(null);
  const serverThreadKey = serverThreadRef ? scopedThreadKey(serverThreadRef) : null;
  const handoffDraftId = draftRedirect ? draftId : promotedDraftId;
  const nextChatViewKey =
    serverThreadKey === null
      ? null
      : chatViewKey?.threadKey === serverThreadKey
        ? chatViewKey
        : handoffDraftId
          ? {
              threadKey: serverThreadKey,
              key: handoffDraftId,
            }
          : null;
  if (nextChatViewKey !== chatViewKey) {
    setChatViewKey(nextChatViewKey);
  }
  const environmentHasDraftThreads = useComposerDraftStore((store) =>
    serverThreadRef ? store.hasDraftThreadsInEnvironment(serverThreadRef.environmentId) : false,
  );
  // Until the shell lists the thread, its own load (HTTP, then the socket)
  // decides whether it exists. Read only then: once listed, ChatView keeps
  // this stream open and its updates need not re-render the route.
  const unlistedThreadRef =
    target.kind === "server" && serverThreadShell === null && draftThread === null
      ? target.threadRef
      : null;
  const unlistedThreadDetail = useEnvironmentThread(
    unlistedThreadRef?.environmentId ?? null,
    unlistedThreadRef?.threadId ?? null,
  );
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete,
    serverThreadExists: serverThreadShell !== null,
    serverThreadDeleted: serverThreadShell?.deletedAt != null,
    unlistedThreadDetail,
    draftThreadExists: draftThread !== null,
  });
  const environmentHasAnyThreads = environmentThreadRefs.length > 0 || environmentHasDraftThreads;
  // oxlint-disable-next-line elysia/no-unreasoned-state-sync -- Synchronize browser route changes with the retained conversation-tab store.
  useEffect(() => {
    if (!SINGLE_PROVIDER_UI || background) return;
    const tabs = currentConversationTabsStore().getState();
    if (target.kind === "draft") {
      if (draftRedirect) {
        const promoted = {
          kind: "server" as const,
          threadRef: draftRedirect,
        };
        tabs.retarget(target, promoted);
        tabs.open(promoted);
      } else if (draftSession) {
        tabs.open(target);
      }
    } else if (renderState !== "missing" && !archived) {
      if (promotedDraftId)
        tabs.retarget(
          {
            kind: "draft",
            draftId: promotedDraftId,
          },
          target,
        );
      tabs.open(target);
    }
  }, [background, draftRedirect, draftSession, promotedDraftId, renderState, target, archived]);
  // oxlint-disable-next-line elysia/no-unreasoned-state-sync -- Follow the draft store's redirect or forget a deleted draft.
  useEffect(() => {
    if (background || target.kind !== "draft" || draftSession) return;
    if (draftRedirect) {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(draftRedirect),
        replace: true,
      });
      return;
    }
    const next = SINGLE_PROVIDER_UI
      ? currentConversationTabsStore().getState().forget(target)
      : null;
    if (next) {
      void navigateTab(next, true);
    } else {
      void navigate({
        to: "/",
        replace: true,
      });
    }
  }, [background, draftRedirect, draftSession, navigate, navigateTab, target]);
  // oxlint-disable-next-line elysia/no-unreasoned-state-sync -- Reconcile authoritative server deletion with pending drop and conversation-tab registries, then update the browser route.
  useEffect(() => {
    if (target.kind !== "server" || !bootstrapComplete) {
      return;
    }
    if (renderState === "missing") {
      const { clearPendingFileDropsForThread } = useSidebarPendingFileDropStore.getState();
      clearPendingFileDropsForThread(target.threadRef);
      const next = SINGLE_PROVIDER_UI
        ? currentConversationTabsStore().getState().forget(target)
        : null;
      if (background) return;
      if (next) {
        void navigateTab(next, true);
      } else if (SINGLE_PROVIDER_UI || environmentHasAnyThreads) {
        void navigate({
          to: "/",
          replace: true,
        });
      }
    }
  }, [
    background,
    bootstrapComplete,
    environmentHasAnyThreads,
    navigate,
    navigateTab,
    renderState,
    target,
  ]);
  let view: React.ReactNode = null;
  if (draftId !== null && draftSession) {
    view = (
      <ChatView
        key={draftId}
        draftId={draftId}
        environmentId={draftSession.environmentId}
        threadId={draftSession.threadId}
        routeKind="draft"
        forceExpandedMobileComposer
      />
    );
  } else if (
    serverThreadRef &&
    (renderState === "ready" ||
      (renderState === "loading" && (serverThreadShell !== null || nextChatViewKey !== null)))
  ) {
    view = (
      <ChatView
        key={nextChatViewKey?.key}
        environmentId={serverThreadRef.environmentId}
        threadId={serverThreadRef.threadId}
        routeKind="server"
      />
    );
  }
  return (
    <SidebarInset
      variant="split"
      className="h-svh min-h-0 overflow-hidden overscroll-y-none md:h-dvh [&[hidden]]:hidden"
      hidden={background}
      inert={background}
    >
      <BackgroundThreadContext value={background}>{view}</BackgroundThreadContext>
    </SidebarInset>
  );
}
