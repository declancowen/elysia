import { beforeEach, expect, it } from "vite-plus/test";
import { useConversationTabsStore } from "./conversationTabsStore";
import { surfaceTabForLocation } from "./surfaceTabs";

beforeEach(() => useConversationTabsStore.setState({ tabs: [], activeId: null }));
it("keeps shared surfaces distinct and restores scoped settings without duplicate tabs", () => {
  const store = useConversationTabsStore.getState();
  for (const path of ["/projects", "/usage", "/agents", "/settings/general"])
    store.open(surfaceTabForLocation(path, {})!, true);
  const settings = surfaceTabForLocation("/settings/projects", {
    project: "project-one",
    machine: "local",
  })!;
  store.open(settings, true);
  const id = useConversationTabsStore.getState().activeId;
  store.open(
    surfaceTabForLocation("/settings/projects", { machine: "local", project: "project-one" })!,
    true,
  );
  expect(useConversationTabsStore.getState().activeId).toBe(id);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(5);
  store.open(surfaceTabForLocation("/settings/projects", { project: "project-two" })!, true);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(6);
  expect(store.close(useConversationTabsStore.getState().activeId!)).toEqual(settings);
  expect(surfaceTabForLocation("/settings/scheduled-tasks", {})).toBeNull();
  expect(surfaceTabForLocation("/agents", { create: true })).toBeNull();
});

it("keeps the rail's MCP surface separate from MCP settings", () => {
  const store = useConversationTabsStore.getState();
  const workspace = surfaceTabForLocation("/mcp", {})!;
  const settings = surfaceTabForLocation("/settings/mcp", {})!;
  store.open(workspace, true);
  store.open(settings, true);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([
    workspace,
    settings,
  ]);
  expect(store.close(useConversationTabsStore.getState().activeId!)).toEqual(workspace);
});
