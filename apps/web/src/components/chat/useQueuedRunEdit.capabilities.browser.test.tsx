import { createElement, useImperativeHandle } from "react";
import { act, render } from "../../../test/render";
import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, MessageId, RunId, ThreadId } from "@elysiatools/contracts";
import { AppAtomRegistryProvider, appAtomRegistry } from "../../rpc/atomRegistry";
import { useComposerDraftStore, type ComposerFileAttachment } from "../../composerDraftStore";

const mocks = await vi.hoisted(async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    config: Atom.make(new Map<string, unknown>()).pipe(Atom.keepAlive),
    command: vi.fn(async (_input: unknown) => ({ _tag: "Success" as const })),
    startUpload: vi.fn(),
    waitUploads: vi.fn(async (_ids: readonly string[]) => {}),
  };
});
vi.mock("../../state/server", () => ({ environmentServerConfigsAtom: mocks.config }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.command }));
vi.mock("../../assets/assetUrls", () => ({ useAssetUrls: () => [] }));
vi.mock("../../lib/attachmentUploadQueue", () => ({
  startAttachmentUpload: mocks.startUpload,
  awaitAttachmentUploads: mocks.waitUploads,
  getUploadedAttachments: () => [
    { type: "file", id: "uploaded", name: "notes.txt", mimeType: "text/plain", sizeBytes: 5 },
  ],
  releaseDraftAttachments: vi.fn(),
}));
vi.mock("../../state/threads", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    threadEnvironment: { editQueuedRun: {}, snapshotAtom: () => Atom.make(null) },
    environmentThreadDetails: {
      statusAtom: () => Atom.make("ready"),
      quietThreadAtom: () => Atom.make(null),
    },
    environmentThreadShells: { threadShellAtom: () => Atom.make(null) },
  };
});

import { useQueuedRunEdit } from "./useQueuedRunEdit";
const environmentId = EnvironmentId.make("capability-test");
const threadRef = { environmentId, threadId: ThreadId.make("capability-thread") };
const hookRef = { current: null as ReturnType<typeof useQueuedRunEdit> | null };
const errors = vi.fn();
function Harness() {
  const hook = useQueuedRunEdit({
    environmentId,
    routeThreadRef: threadRef,
    threadDraftTarget: threadRef,
    activeThreadId: threadRef.threadId,
    serverProjection: null,
    promptRef: { current: "" },
    composerRef: { current: null },
  });
  useImperativeHandle(hookRef, () => hook);
  return null;
}
function current() {
  if (hookRef.current === null) throw new Error("Hook did not mount");
  return hookRef.current;
}
function advertise(value: boolean | undefined) {
  appAtomRegistry.set(
    mocks.config,
    new Map([
      [
        environmentId,
        {
          environment: {
            capabilities: {
              ...(value === undefined ? {} : { attachmentUploads: value }),
              fileAttachments: { maxUploadBytes: 1024 },
            },
          },
        },
      ],
    ]),
  );
}
const file: ComposerFileAttachment = {
  type: "file",
  id: "local-file",
  name: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 5,
  file: new File(["notes"], "notes.txt", { type: "text/plain" }),
};
async function begin() {
  mocks.command.mockClear();
  mocks.startUpload.mockClear();
  errors.mockClear();
  mocks.waitUploads.mockImplementation(async () => {});
  useComposerDraftStore.setState({ draftsByThreadKey: {}, draftThreadsByThreadKey: {} });
  const screen = await render(createElement(AppAtomRegistryProvider, null, createElement(Harness)));
  await act(async () =>
    current().beginEdit({
      runId: RunId.make("queued-run"),
      messageId: MessageId.make("queued-message"),
      text: "Original",
      attachments: [],
    }),
  );
  await act(async () => useComposerDraftStore.getState().addFiles(current().draftTarget, [file]));
  return screen;
}
function save() {
  return current().saveEdit(
    {
      prompt: "Updated",
      images: [],
      files: [file],
      terminalContexts: [],
      reviewComments: [],
      previewAnnotations: [],
      threadContexts: [],
      environmentContexts: [],
    },
    errors,
  );
}
describe("queued edit live upload capability", () => {
  it.each([false, undefined])(
    "does not upload or dispatch with advertised capability %s",
    async (capability) => {
      advertise(capability);
      await using _screen = await begin();
      await act(async () => save());
      expect(mocks.startUpload).not.toHaveBeenCalled();
      expect(mocks.command).not.toHaveBeenCalled();
      expect(errors.mock.calls.at(-1)?.[1]).toMatch(/does not accept file attachments/i);
      expect(current().isEditing).toBe(true);
      expect(
        useComposerDraftStore.getState().getComposerDraft(current().draftTarget)?.files,
      ).toEqual([file]);
    },
  );
  it("keeps the edited draft and avoids RPC if capability disappears while upload runs", async () => {
    advertise(true);
    await using _screen = await begin();
    let completeUpload!: () => void;
    const uploadDone = new Promise<void>((resolve) => {
      completeUpload = resolve;
    });
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    mocks.waitUploads.mockImplementation(() => {
      signalStarted();
      return uploadDone;
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = save();
      await started;
    });
    expect(mocks.startUpload).toHaveBeenCalledOnce();
    advertise(false);
    await act(async () => {
      completeUpload();
      await pending;
    });
    expect(mocks.command).not.toHaveBeenCalled();
    expect(current().isEditing).toBe(true);
    expect(useComposerDraftStore.getState().getComposerDraft(current().draftTarget)?.files).toEqual(
      [file],
    );
  });
});
