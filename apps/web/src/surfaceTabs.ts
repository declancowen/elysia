import type { SurfaceTabTarget } from "./conversationTabsStore";
import { SETTINGS_SECTION_LABELS, type SettingsPath } from "./components/settings/settingsSearch";
import { validateSettingsScopeSearch } from "./components/settings/settingsScope";

/** Section visits share the same tab identities as explicit item navigation. */
export function surfaceTabForLocation(
  path: string,
  search: Record<string, unknown>,
): SurfaceTabTarget | null {
  if (path === "/projects") return { kind: "surface", path, title: "Projects" };
  if (path === "/usage") return { kind: "surface", path, title: "Stats" };
  if (path === "/agents")
    return search.create || search.projectId ? null : { kind: "surface", path, title: "Agents" };
  if (path === "/settings/scheduled-tasks" || !Object.hasOwn(SETTINGS_SECTION_LABELS, path))
    return null;
  return {
    kind: "surface",
    path: path as SettingsPath,
    title: SETTINGS_SECTION_LABELS[path as SettingsPath],
    search: validateSettingsScopeSearch(search),
  };
}
