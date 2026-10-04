import { expect, it } from "vite-plus/test";
import { agentSidebarActiveForPath } from "./agentSidebarStore";
it("keeps the origin sidebar while editing and restores normal destination rules", () => {
  expect(agentSidebarActiveForPath("/agents", false, true)).toBe(false);
  expect(agentSidebarActiveForPath("/agents", true, true)).toBe(true);
  expect(agentSidebarActiveForPath("/agents", false)).toBe(true);
  expect(agentSidebarActiveForPath("/settings", true)).toBe(false);
});
