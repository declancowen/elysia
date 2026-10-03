import { beforeEach, expect, it } from "vite-plus/test";
import {
  orderAgents,
  parseAgentSidebarPreferences,
  removeAgentSection,
  toggleAgentPinned,
  useAgentSidebarPreferences,
} from "./agentSidebarPreferences";
beforeEach(() => useAgentSidebarPreferences.setState(parseAgentSidebarPreferences(null)));
it("restores valid sections and drops stale assignments without dropping pins", () => {
  const result = parseAgentSidebarPreferences({
    sections: [{ id: "design", name: " Design " }, { id: "design", name: "Duplicate" }, null],
    assignment: { a: "design", b: "deleted" },
    pinned: ["a", "a", 42],
    sort: "unknown",
  });
  expect(result.sections).toEqual([{ id: "design", name: "Design" }]);
  expect(result.assignment).toEqual({ a: "design" });
  expect(result.pinned).toEqual(["a"]);
});
it("pinning is reversible and deleting a section retains its agents and pins", () => {
  useAgentSidebarPreferences.setState({
    sections: [{ id: "design", name: "Design" }],
    assignment: { a: "design" },
  });
  toggleAgentPinned("a");
  removeAgentSection("design");
  expect(useAgentSidebarPreferences.getState().pinned).toEqual(["a"]);
  expect(useAgentSidebarPreferences.getState().assignment).toEqual({});
  toggleAgentPinned("a");
  expect(useAgentSidebarPreferences.getState().pinned).toEqual([]);
});
it("keeps agents ordered by activity with stable ties", () => {
  const entries = [
    { key: "a", name: "Zoe", updated: "2" },
    { key: "b", name: "Alfred", updated: "1" },
    { key: "c", name: "Edna", updated: "3" },
  ];
  expect(orderAgents(entries).map((x) => x.key)).toEqual(["c", "a", "b"]);
});
