import { expect, it } from "vite-plus/test";
import { isSidebarUtilityPage } from "./mainAppLocation";

it("preserves the Home conversation while visiting navigation destinations", () => {
  for (const pathname of [
    "/agents",
    "/projects",
    "/settings",
    "/settings/scheduled-tasks",
    "/usage",
    "/pull-requests",
    "/projects/legacy-project",
  ])
    expect(isSidebarUtilityPage(pathname)).toBe(true);
  for (const pathname of ["/", "/draft/new-chat", "/local/thread-id"])
    expect(isSidebarUtilityPage(pathname)).toBe(false);
});
