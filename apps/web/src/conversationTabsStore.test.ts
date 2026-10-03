import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, expect, it } from "vite-plus/test";
import { DraftId } from "./composerDraftStore";
import { useConversationTabsStore, useAgentConversationTabsStore } from "./conversationTabsStore";
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

it("keeps Workspace and Agents navigation independent", () => {
  useConversationTabsStore.getState().open(a);
  useAgentConversationTabsStore.setState({ tabs: [], activeId: null });
  useAgentConversationTabsStore.getState().open(b);
  useAgentConversationTabsStore.getState().open(c, true);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([a]);
  expect(useAgentConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([b, c]);
});
