import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId, PageId, WorkTaskId } from "@t3tools/contracts";
import { beforeEach, expect, it } from "vite-plus/test";
import { DraftId } from "./composerDraftStore";
import {
  useConversationTabsStore,
  currentConversationTabsStore,
  type ConversationTabTarget,
} from "./conversationTabsStore";
import type { ThreadRouteTarget } from "./threadRoutes";

const conversation = (name: string, environment = "local"): ThreadRouteTarget => ({
  kind: "server",
  threadRef: scopeThreadRef(EnvironmentId.make(environment), ThreadId.make(name)),
});
const a = conversation("agent-a");
const b = conversation("channel-b");
const c = conversation("project-c");
beforeEach(() => useConversationTabsStore.setState({ tabs: [], activeId: null }));

it("replaces the current conversation while retaining the first tab identity", () => {
  const store = useConversationTabsStore.getState();
  store.open(a);
  const id = useConversationTabsStore.getState().activeId;
  store.open(b);
  expect(useConversationTabsStore.getState().tabs).toEqual([{ id, target: b }]);
  expect(store.close(id!)).toBeNull();
  expect(useConversationTabsStore.getState().tabs).toHaveLength(1);
});

it("adds a tab explicitly and returns to an existing conversation without duplicating it", () => {
  const store = useConversationTabsStore.getState();
  store.open(a);
  const firstId = useConversationTabsStore.getState().activeId;
  store.open(b, true);
  const secondId = useConversationTabsStore.getState().activeId;
  store.open(a);
  expect(useConversationTabsStore.getState().activeId).toBe(firstId);
  store.open(b, true);
  expect(useConversationTabsStore.getState().activeId).toBe(secondId);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(2);
  store.open(c);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([a, c]);
});

it("keeps the first tab open and moves to a remaining conversation when closing the active extra tab", () => {
  const store = useConversationTabsStore.getState();
  store.open(a);
  const firstId = useConversationTabsStore.getState().activeId!;
  store.open(b, true);
  const secondId = useConversationTabsStore.getState().activeId!;
  store.open(c, true);
  const thirdId = useConversationTabsStore.getState().activeId!;
  expect(store.close(firstId)).toBeNull();
  expect(store.close(secondId)).toBeNull();
  expect(useConversationTabsStore.getState().activeId).toBe(thirdId);
  expect(store.close(thirdId)).toEqual(a);
  expect(useConversationTabsStore.getState().activeId).toBe(firstId);
});

it("scopes conversation identity to the environment", () => {
  const store = useConversationTabsStore.getState();
  store.open(a);
  store.open(conversation("agent-a", "other"), true);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(2);
});

it("carries a draft tab through promotion without leaving a second server tab", () => {
  const store = useConversationTabsStore.getState();
  const draftId = DraftId.make("draft-a");
  store.open({ kind: "draft", draftId });
  const id = useConversationTabsStore.getState().activeId;
  store.open(a, true);
  store.retarget({ kind: "draft", draftId }, a);
  store.open(a);
  expect(useConversationTabsStore.getState().tabs).toEqual([{ id, target: a }]);
  expect(useConversationTabsStore.getState().activeId).toBe(id);
});

it("removes an invalid conversation and selects a valid remaining tab", () => {
  const store = useConversationTabsStore.getState();
  store.open(a);
  store.open(b, true);
  expect(store.forget(b)).toEqual(a);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([a]);
  expect(store.forget(a)).toBeNull();
  expect(useConversationTabsStore.getState().activeId).toBeNull();
});

it("shares Workspace and Agents tabs without duplicating an existing conversation", () => {
  useConversationTabsStore.getState().open(a);
  currentConversationTabsStore().getState().open(b, true);
  currentConversationTabsStore().getState().open(a, true);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([a, b]);
  expect(useConversationTabsStore.getState().activeId).toBe(
    useConversationTabsStore.getState().tabs[0]!.id,
  );
});

const pr: ConversationTabTarget = {
  kind: "pull-request",
  environmentId: EnvironmentId.make("local"),
  projectId: ProjectId.make("project"),
  host: "github.com",
  repository: "company/repo",
  number: 42,
};

it("keeps mixed tabs in place, reuses an open pull request, and returns to the conversation on close", () => {
  const store = useConversationTabsStore.getState();
  store.open(a);
  const firstId = useConversationTabsStore.getState().activeId!;
  store.open(pr, true);
  const prId = useConversationTabsStore.getState().activeId!;
  store.open(b, true);
  store.open(pr, true);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([a, pr, b]);
  expect(useConversationTabsStore.getState().activeId).toBe(prId);
  expect(store.close(prId)).toEqual(b);
  store.open(pr);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([a, pr]);
  expect(store.close(firstId)).toBeNull();
  expect(store.close(useConversationTabsStore.getState().activeId!)).toEqual(a);
});

it("scopes pull requests to their host, repository, project, and environment", () => {
  const store = useConversationTabsStore.getState();
  for (const target of [
    pr,
    { ...pr, host: "github.company.com" },
    { ...pr, repository: "other/repo" },
    { ...pr, projectId: ProjectId.make("other-project") },
    { ...pr, environmentId: EnvironmentId.make("remote") },
  ])
    store.open(target, true);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(5);
});

it("redirects a removed conversation to the remaining pull request", () => {
  const store = useConversationTabsStore.getState();
  store.open(pr);
  store.open(a, true);
  expect(store.forget(a)).toEqual(pr);
});

it("treats differently cased host names as the same pull-request tab", () => {
  const store = useConversationTabsStore.getState();
  store.open(pr);
  store.open({ ...pr, host: "GitHub.COM" }, true);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(1);
});

it("recognizes active and inactive tabs and releases replaced or closed targets", () => {
  const store = useConversationTabsStore.getState();
  expect(store.isOpen(a)).toBe(false);
  store.open(a);
  expect(store.isOpen(a)).toBe(true);
  store.open(b, true);
  expect(store.isOpen(a)).toBe(true);
  expect(store.isOpen(b)).toBe(true);
  store.open(c);
  expect(store.isOpen(b)).toBe(false);
  expect(store.isOpen(c)).toBe(true);
  store.close(useConversationTabsStore.getState().activeId!);
  expect(store.isOpen(c)).toBe(false);
  expect(store.isOpen(conversation("agent-a", "other"))).toBe(false);
});

it("recognizes a pull request regardless of host case but keeps scope boundaries", () => {
  const store = useConversationTabsStore.getState();
  store.open(pr);
  store.open(a, true);
  expect(store.isOpen({ ...pr, host: "GitHub.COM" })).toBe(true);
  expect(store.isOpen({ ...pr, environmentId: EnvironmentId.make("remote") })).toBe(false);
  expect(store.isOpen({ ...pr, projectId: ProjectId.make("other") })).toBe(false);
  expect(store.isOpen({ ...pr, repository: "other/repo" })).toBe(false);
  expect(store.isOpen({ ...pr, number: 43 })).toBe(false);
});

it("keeps page and task identities separate and reuses tabs after title changes", () => {
  const page: ConversationTabTarget = {
    kind: "page",
    environmentId: EnvironmentId.make("local"),
    id: PageId.make("page-00000000-0000-0000-0000-000000000001"),
    title: "Notes",
  };
  const task: ConversationTabTarget = {
    kind: "task",
    environmentId: EnvironmentId.make("local"),
    id: WorkTaskId.make("TASK-1"),
    title: "Build",
  };
  const store = useConversationTabsStore.getState();
  store.open(a);
  store.open(page, true);
  const pageTabId = useConversationTabsStore.getState().activeId!;
  store.open(task, true);
  store.retarget(page, { ...page, title: "Updated notes" });
  store.open({ ...page, title: "Updated notes" }, true);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(3);
  expect(useConversationTabsStore.getState().activeId).toBe(pageTabId);
  expect(store.close(pageTabId)).toEqual(task);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([a, task]);
});

it("preserves the list when an item is explicitly opened in a new tab", () => {
  const list: ConversationTabTarget = {
    kind: "task",
    environmentId: EnvironmentId.make("local"),
    id: null,
    title: "Tasks",
  };
  const task: ConversationTabTarget = { ...list, id: WorkTaskId.make("TASK-1"), title: "Build" };
  const store = useConversationTabsStore.getState();
  store.open(list);
  const listId = useConversationTabsStore.getState().activeId!;
  store.open(task, true);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([list, task]);
  const taskId = useConversationTabsStore.getState().activeId!;
  expect(store.close(taskId)).toEqual(list);
  expect(useConversationTabsStore.getState().activeId).toBe(listId);
});

it("deduplicates creation tabs and preserves each tab identity when saved", () => {
  const store = useConversationTabsStore.getState();
  store.open(a);
  store.open({ kind: "agent-create" }, true);
  const agentId = useConversationTabsStore.getState().activeId;
  store.open({ kind: "agent-create", channel: true }, true);
  const channelId = useConversationTabsStore.getState().activeId;
  store.open({ kind: "agent-create" }, true);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(3);
  expect(useConversationTabsStore.getState().activeId).toBe(agentId);
  store.retarget({ kind: "agent-create" }, b);
  expect(useConversationTabsStore.getState().activeId).toBe(agentId);
  expect(
    useConversationTabsStore.getState().tabs.find((tab) => tab.id === channelId)?.target,
  ).toEqual({ kind: "agent-create", channel: true });
});
