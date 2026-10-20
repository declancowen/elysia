import {
  AuthOrchestrationOperateScope,
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type ModelSelection,
  type OrchestrationV2ThreadProjection,
  type ServerConfig,
} from "@elysiatools/contracts";
import {
  v2Now,
  v2Projection,
} from "../../../../packages/client-runtime/src/state/orchestrationV2TestFixtures";
import type { DraftComposerImageAttachment } from "../lib/composerImages";
import type { PendingThreadRequests } from "@elysiatools/client-runtime/state/thread-requests";
import {
  scopeProject,
  type EnvironmentProject,
  type EnvironmentThreadShell,
} from "@elysiatools/client-runtime/state/shell";
import { formatAgentMention } from "@elysiatools/shared/agentMentions";
import * as Cause from "effect/Cause";
import { makeThreadShellFixture } from "../test-fixtures";
import { AsyncResult, type Atom } from "effect/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// The handoff case exercises a retained provider; production provider policy remains unchanged.
vi.mock("@elysiatools/contracts", async (original) => ({
  ...(await original<typeof import("@elysiatools/contracts")>()),
  isEnabledProviderDriver: () => true,
}));

const state = vi.hoisted(() => ({
  projects: [] as ReadonlyArray<EnvironmentProject>,
  threadShells: [] as ReadonlyArray<EnvironmentThreadShell>,
  prepare: vi.fn<typeof import("../lib/attachmentUpload").prepareTurnAttachments>(),
  delegate: vi.fn(),
  connectionError: vi.fn(),
  liveRetentions: 0,
  releasedRetentions: 0,
  grantedEnvironments: new Set<string>(),
  connectionState: "connected",
  draft: {
    text: "Keep my draft",
    attachments: [] as DraftComposerImageAttachment[],
    modelSelection: undefined as ModelSelection | undefined,
  },
  serverConfig: null as ServerConfig | null,
  projection: null as OrchestrationV2ThreadProjection | null,
  pendingRequests: { approvals: [], userInputs: [] } as PendingThreadRequests,
  enqueue: vi.fn(async () => undefined),
  clearDraft: vi.fn(),
  approve: vi.fn(),
  answer: vi.fn(),
  feedback: vi.fn(),
  updateSettings: vi.fn(),
  question: {
    id: "language",
    header: "Language",
    question: "Which language?",
    options: [{ label: "TypeScript", description: "Use the existing code" }],
    multiSelect: false,
  },
  thread: {
    id: "thread",
    environmentId: "secondary",
    projectId: "project",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    runtime: null,
    latestRun: null,
  },
}));

vi.mock("react", () => ({
  useCallback: <A>(callback: A) => callback,
  useEffect: () => {},
  useRef: <A>(current: A) => ({ current }),
  useMemo: <A>(factory: () => A) => factory(),
  useState: <A>(initial: A | (() => A)) => [
    typeof initial === "function" ? (initial as () => A)() : initial,
    vi.fn(),
  ],
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));
vi.mock("../lib/attachmentUpload", () => ({
  prepareTurnAttachments: state.prepare,
  validateDraftFileAttachments: () => null,
}));
vi.mock("../lib/uuid", () => ({ uuidv4: () => "uuid" }));
vi.mock("./queued-run-edit", () => ({
  useQueuedRunEdit: () => null,
  getQueuedRunEdit: () => null,
}));
vi.mock("./preferences", async () => {
  const { Atom, AsyncResult } = await import("effect/reactivity");
  return { mobilePreferencesAtom: Atom.make(AsyncResult.success({})) };
});
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@effect/atom-react", async () => {
  const { appAtomRegistry } = await import("./atom-registry");
  return { useAtomValue: <A>(atom: Atom.Atom<A>) => appAtomRegistry.get(atom) };
});
vi.mock("./entities", () => ({
  useProjects: () => state.projects,
  useThreadShells: () => state.threadShells,
  useServerConfigs: () => new Map(),
}));
vi.mock("./projects", () => ({ projectEnvironment: { delegateAgent: state.delegate } }));
vi.mock("./session", () => ({
  readEnvironmentScope: (environmentId: string, scope: string) =>
    scope === AuthOrchestrationOperateScope && state.grantedEnvironments.has(environmentId),
}));
vi.mock("./use-thread-selection", () => ({
  useThreadSelection: () => ({
    selectedThread: state.thread,
    selectedThreadCreation: null,
    selectedEnvironmentRuntime: {
      connectionState: state.connectionState,
      serverConfig: state.serverConfig,
    },
  }),
}));
vi.mock("./use-thread-detail", () => ({
  useSelectedThreadProjection: () =>
    state.projection === null ? null : { projection: state.projection },
  useSelectedThreadVisibleTurnItems: () => [],
  useSelectedThreadPendingRequests: () => state.pendingRequests,
}));
vi.mock("./use-atom-command", () => ({ useAtomCommand: <A>(command: A) => command }));
vi.mock("./threads", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    environmentThreadDetails: { queueWorkflowAtom: () => Atom.make(null) },
    environmentThreadShells: { threadShellsForProjectRefsAtom: () => Atom.make([]) },
    threadEnvironment: {
      respondToApproval: state.approve,
      respondToUserInput: state.answer,
      uploadFeedback: state.feedback,
    },
  };
});
vi.mock("./use-thread-outbox", async () => {
  const { Atom } = await import("effect/reactivity");
  return { dispatchingQueuedMessageIdAtom: Atom.make(null), useThreadOutboxMessages: () => ({}) };
});
vi.mock("./thread-outbox", () => ({ enqueueThreadOutboxMessage: state.enqueue }));
vi.mock("./composer-attachment-uploads", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    composerAttachmentUploadsAtom: Atom.make({}),
    composerAttachmentUploadBlockReason: () => null,
    composerAttachmentsStillUploading: () => false,
  };
});
vi.mock("./use-composer-drafts", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    composerDraftsAtom: Atom.make({}),
    composerContextImportsAtom: Atom.make({}),
    getComposerDraftSnapshot: () => state.draft,
    clearComposerDraftContent: state.clearDraft,
    retainComposerDraftAttachments: () => {
      state.liveRetentions += 1;
      return {
        update: vi.fn(),
        release: () => {
          state.liveRetentions -= 1;
          state.releasedRetentions += 1;
        },
      };
    },
    clearComposerDraft: state.clearDraft,
    setComposerDraftText: (_key: string, text: string) => {
      state.draft.text = text;
    },
    updateComposerDraftSettings: state.updateSettings,
    ensureComposerDraftsLoaded: () => {},
    scheduleUnusedComposerAttachmentCleanup: () => {},
    appendComposerDraftAttachments: vi.fn(),
    appendComposerDraftText: vi.fn(),
    mergeComposerDraftContent: vi.fn(),
    removeComposerDraftAttachment: vi.fn(),
    useComposerDraft: () => state.draft,
    useComposerDraftSettings: () => state.draft,
    questionAttachmentDraftsAtom: () => Atom.make({}),
  };
});
vi.mock("../lib/composerImages", () => ({
  convertPastedImagesToAttachments: vi.fn(),
  pasteComposerClipboard: vi.fn(),
  pickComposerFiles: vi.fn(),
  pickComposerMedia: vi.fn(),
}));
vi.mock("../lib/commandMetadata", () => ({
  makeQueuedMessageMetadata: () => ({
    messageId: "message",
    commandId: "command",
    createdAt: "2026-09-05T00:00:00.000Z",
  }),
}));
vi.mock("../lib/copyTextWithHaptic", () => ({ copyTextWithHaptic: vi.fn() }));
vi.mock("./use-remote-environment-registry", () => ({
  setPendingConnectionError: state.connectionError,
}));

import { useThreadComposerState } from "../features/threads/use-thread-composer-state";
import { useSelectedThreadRequests } from "./use-selected-thread-requests";

beforeEach(() => {
  state.grantedEnvironments = new Set(["primary"]);
  state.connectionState = "connected";
  state.draft = { text: "Keep my draft", attachments: [], modelSelection: undefined };
  state.projection = null;
  state.serverConfig = {
    providers: [{ instanceId: "codex", driver: "codex", enabled: true }],
    environment: { capabilities: {} },
  } as unknown as ServerConfig;
  state.pendingRequests = {
    approvals: [
      {
        requestId: RuntimeRequestId.make("approval"),
        requestKind: "command",
        createdAt: "2026-09-05T00:00:00.000Z",
        responseCapability: "live",
      },
    ],
    userInputs: [],
  };
  vi.clearAllMocks();
  state.projects = [];
  state.threadShells = [];
  state.liveRetentions = 0;
  state.releasedRetentions = 0;
  state.prepare.mockReset().mockResolvedValue({
    status: "ready",
    attachments: [],
    draftAttachments: [],
    pendingAttachmentIds: [],
  });
  state.delegate.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.approve.mockResolvedValue(AsyncResult.success(undefined));
  state.answer.mockResolvedValue(AsyncResult.success(undefined));
  state.feedback.mockResolvedValue(AsyncResult.success({ feedbackId: "feedback" }));
});

describe("mobile task permissions", () => {
  it("keeps a connected read-only task's draft instead of queueing it with another environment's grant", async () => {
    const composer = useThreadComposerState();
    expect(await composer.onSendMessage()).toBeNull();
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).not.toHaveBeenCalled();
    composer.onChangeDraftMessage("Edited locally");
    composer.onUpdateInteractionMode("plan");
    expect(state.draft.text).toBe("Edited locally");
    expect(state.updateSettings).toHaveBeenCalledWith("secondary:thread", {
      interactionMode: "plan",
    });
  });

  it("rechecks a retained send callback before clearing or queueing the draft", async () => {
    state.grantedEnvironments.add("secondary");
    const composer = useThreadComposerState();
    state.grantedEnvironments.delete("secondary");
    expect(await composer.onSendMessage()).toBeNull();
    expect(state.clearDraft).not.toHaveBeenCalled();
    expect(state.enqueue).not.toHaveBeenCalled();
    state.grantedEnvironments.add("secondary");
    expect(await composer.onSendMessage()).toBe("message");
    expect(state.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: "secondary",
        threadId: "thread",
        text: "Keep my draft",
      }),
    );
  });

  it("preserves offline queueing without dispatching feedback through the queue action", async () => {
    state.connectionState = "disconnected";
    expect(await useThreadComposerState().onSendMessage()).toBe("message");
    expect(state.enqueue).toHaveBeenCalledTimes(1);
    state.draft.text = "/feedback The agent stopped early.";
    expect(await useThreadComposerState().onSendMessage()).toBeNull();
    expect(state.feedback).not.toHaveBeenCalled();
    expect(state.enqueue).toHaveBeenCalledTimes(1);
    expect(state.clearDraft).toHaveBeenCalledTimes(1);
  });

  it("rechecks the target environment before an approval response", async () => {
    state.grantedEnvironments.add("secondary");
    const requests = useSelectedThreadRequests();
    state.grantedEnvironments.delete("secondary");
    await requests.onRespondToApproval(RuntimeRequestId.make("approval"), "accept");
    expect(state.approve).not.toHaveBeenCalled();
    state.grantedEnvironments.add("secondary");
    await requests.onRespondToApproval(RuntimeRequestId.make("approval"), "accept");
    expect(state.approve).toHaveBeenCalledWith({
      environmentId: "secondary",
      input: { threadId: "thread", requestId: "approval", decision: "accept" },
    });
  });

  it("keeps answer drafts editable after revocation while blocking their submission", async () => {
    state.pendingRequests = {
      approvals: [],
      userInputs: [
        {
          requestId: RuntimeRequestId.make("input"),
          createdAt: "2026-09-05T00:00:00.000Z",
          responseCapability: "live",
          dismissible: false,
          questions: [state.question],
        },
      ],
    };
    const requestId = RuntimeRequestId.make("input");
    useSelectedThreadRequests().onSelectUserInputOption(requestId, state.question, "TypeScript");
    state.grantedEnvironments.add("secondary");
    const requests = useSelectedThreadRequests();
    expect(requests.activePendingUserInputAnswers).toEqual({ language: "TypeScript" });
    state.grantedEnvironments.delete("secondary");
    await requests.onSubmitUserInput();
    expect(state.answer).not.toHaveBeenCalled();
    expect(useSelectedThreadRequests().activePendingUserInputAnswers).toEqual({
      language: "TypeScript",
    });
    state.grantedEnvironments.add("secondary");
    await requests.onSubmitUserInput();
    expect(state.answer).toHaveBeenCalledWith({
      environmentId: "secondary",
      input: { threadId: "thread", requestId: "input", answers: { language: "TypeScript" } },
    });
  });
});

describe("mobile handoff preview and submission", () => {
  it("follows project enablement and provider availability for the selected destination", async () => {
    state.grantedEnvironments.add("secondary");
    const instanceId = ProviderInstanceId.make("antigravity");
    const projectId = ProjectId.make(state.thread.projectId);
    const selection = { instanceId, model: "gemini" };
    const provider = {
      instanceId,
      driver: ProviderDriverKind.make("antigravity"),
      enabled: false,
      installed: true,
      auth: { status: "authenticated" as const },
      availability: "available" as "available" | "unavailable",
      models: [{ slug: selection.model }],
    };
    const projectOverride = { enabled: false };
    state.serverConfig = {
      ...state.serverConfig,
      providers: [provider],
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: { [instanceId]: { driver: provider.driver, enabled: false } },
        projectSettingsOverrides: {
          [projectId]: { providerInstances: { [instanceId]: projectOverride } },
        },
      },
    } as unknown as ServerConfig;
    state.draft.modelSelection = selection;
    const source = v2Projection.thread.modelSelection;
    state.projection = {
      ...v2Projection,
      runs: [
        {
          id: RunId.make("source-run"),
          threadId: v2Projection.thread.id,
          ordinal: 1,
          providerInstanceId: source.instanceId,
          modelSelection: source,
          providerThreadId: null,
          userMessageId: MessageId.make("source-message"),
          rootNodeId: null,
          activeAttemptId: null,
          status: "completed",
          requestedAt: v2Now,
          startedAt: v2Now,
          completedAt: v2Now,
          checkpointId: null,
          contextHandoffId: null,
        },
      ],
      visibleTurnItems: [
        {
          position: 0,
          visibility: "local",
          sourceThreadId: v2Projection.thread.id,
          sourceItemId: TurnItemId.make("reply"),
          item: {
            id: TurnItemId.make("reply"),
            threadId: v2Projection.thread.id,
            runId: RunId.make("source-run"),
            nodeId: null,
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: 1,
            type: "assistant_message",
            messageId: MessageId.make("reply"),
            status: "completed",
            title: null,
            text: "Task started",
            streaming: false,
            startedAt: v2Now,
            completedAt: v2Now,
            updatedAt: v2Now,
          },
        },
      ],
    };

    const disabled = useThreadComposerState();
    expect(disabled.pendingHandoff).toBeNull();
    expect(await disabled.onSendMessage()).toBeNull();
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).not.toHaveBeenCalled();

    projectOverride.enabled = true;
    expect(useThreadComposerState().pendingHandoff).toEqual({ from: [source], to: selection });

    provider.availability = "unavailable";
    const unavailable = useThreadComposerState();
    expect(unavailable.pendingHandoff).toBeNull();
    expect(await unavailable.onSendMessage()).toBeNull();
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).not.toHaveBeenCalled();

    provider.availability = "available";
    const available = useThreadComposerState();
    expect(available.pendingHandoff).toEqual({ from: [source], to: selection });
    expect(await available.onSendMessage()).toBe("message");
    expect(state.enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        modelSelection: selection,
        text: "Keep my draft",
      }),
    );
    expect(state.clearDraft).toHaveBeenCalledTimes(1);
  });
});

describe("mobile agent handoff attachment ownership", () => {
  function agentComposer() {
    const environmentId = EnvironmentId.make(state.thread.environmentId);
    const agent = scopeProject(environmentId, {
      id: ProjectId.make("friday"),
      title: "Friday",
      workspaceRoot: "/agents/friday",
      repositoryIdentity: null,
      defaultModelSelection: null,
      scripts: [],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      agentProfile: {
        instructions: "Help",
        avatar: { preset: "brain", color: "#28B4FF" },
        notificationsEnabled: true,
        archived: false,
        conversationThreadId: ThreadId.make("friday-chat"),
      },
    });
    state.projects = [agent];
    state.threadShells = [
      makeThreadShellFixture({
        environmentId,
        id: ThreadId.make(state.thread.id),
        projectId: ProjectId.make(state.thread.projectId),
      }),
      makeThreadShellFixture({
        environmentId,
        id: agent.agentProfile!.conversationThreadId!,
        projectId: agent.id,
      }),
    ];
    state.grantedEnvironments.add(environmentId);
    state.draft.text = `${formatAgentMention(agent.id, agent.title)} investigate`;
    return useThreadComposerState();
  }

  it("releases retained attachments before clearing an accepted handoff draft", async () => {
    const composer = agentComposer();
    state.clearDraft.mockImplementationOnce(() => expect(state.liveRetentions).toBe(0));
    state.delegate.mockImplementation(async () => {
      expect(state.liveRetentions).toBe(1);
      expect(state.clearDraft).not.toHaveBeenCalled();
      return AsyncResult.success(undefined);
    });

    expect(await composer.onSendMessage()).toBe("message");

    expect(state.delegate).toHaveBeenCalledOnce();
    expect(state.liveRetentions).toBe(0);
    expect(state.releasedRetentions).toBe(1);
    expect(state.clearDraft).toHaveBeenCalledOnce();
    expect(state.connectionError).not.toHaveBeenCalled();
  });

  it.each([
    ["upload cancellation", "Attachment upload cancelled. Your draft has been kept."],
    ["upload rejection", "Upload failed"],
    ["delegation failure", "Agent unavailable"],
    ["delegation rejection", "Connection lost"],
  ] as const)(
    "keeps the draft and releases its retention after %s, allowing retry",
    async (failure, error) => {
      const composer = agentComposer();
      const draft = state.draft.text;
      if (failure === "upload cancellation")
        state.prepare.mockResolvedValueOnce({ status: "abandoned" });
      if (failure === "upload rejection") state.prepare.mockRejectedValueOnce(new Error(error));
      if (failure === "delegation failure")
        state.delegate.mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error(error))));
      if (failure === "delegation rejection")
        state.delegate.mockRejectedValueOnce(new Error(error));

      expect(await composer.onSendMessage()).toBeNull();

      expect(state.liveRetentions).toBe(0);
      expect(state.releasedRetentions).toBe(1);
      expect(state.draft.text).toBe(draft);
      expect(state.clearDraft).not.toHaveBeenCalled();
      expect(state.connectionError).toHaveBeenCalledWith(error);

      expect(await composer.onSendMessage()).toBe("message");
      expect(state.liveRetentions).toBe(0);
      expect(state.releasedRetentions).toBe(2);
      expect(state.clearDraft).toHaveBeenCalledOnce();
    },
  );
});
