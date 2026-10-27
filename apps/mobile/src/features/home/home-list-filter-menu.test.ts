import { EnvironmentId } from "@elysiatools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { buildHomeListFilterMenu } from "./home-list-filter-menu";

it("keeps equally named environment and project choices distinct, including selection and reset", () => {
  const first = EnvironmentId.make("first");
  const second = EnvironmentId.make("second");
  const onEnvironmentChange = vi.fn();
  const onProjectChange = vi.fn();
  const menu = buildHomeListFilterMenu({
    environments: [
      { environmentId: first, label: "Computer" },
      { environmentId: second, label: "Computer" },
    ],
    projects: [
      { key: "first-project", label: "App" },
      { key: "second-project", label: "App" },
    ],
    selectedEnvironmentId: second,
    selectedProjectKey: "second-project",
    onEnvironmentChange,
    onProjectChange,
  });
  const environment = menu.items.find((item) => item.id === "environment");
  const project = menu.items.find((item) => item.id === "project");
  if (environment?.type !== "submenu" || project?.type !== "submenu")
    throw new Error("Missing filter groups");
  for (const section of [environment, project]) {
    expect(new Set(section.items.map((item) => item.id)).size).toBe(section.items.length);
    expect(section.items.map((item) => item.state)).toEqual(["off", "off", "on"]);
  }
  environment.items[1]!.onPress();
  project.items[1]!.onPress();
  expect(onEnvironmentChange).toHaveBeenLastCalledWith(first);
  expect(onProjectChange).toHaveBeenLastCalledWith("first-project");
  environment.items[0]!.onPress();
  project.items[0]!.onPress();
  expect(onEnvironmentChange).toHaveBeenLastCalledWith(null);
  expect(onProjectChange).toHaveBeenLastCalledWith(null);
});
