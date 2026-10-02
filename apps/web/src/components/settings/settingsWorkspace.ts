/** Work mode filters presentation only; switching back to Code restores saved settings. */
const CODE_SETTINGS_PATHS = new Set([
  "/settings/projects",
  "/settings/source-control",
  "/settings/integrations",
]);

const CODE_SETTINGS_TARGETS = new Set([
  "projects-and-threads",
  "storage-worktrees",
  "new-threads",
  "worktree-submodules",
  "start-from-origin",
  "add-project-starts-in",
  "auto-settle-merged-threads",
  "git-fetch-interval",
  "terminal-font",
]);

export function isSettingsPathVisibleInWorkspace(path: string, codeWorkspace: boolean) {
  return codeWorkspace || !CODE_SETTINGS_PATHS.has(path);
}

export function isSettingsCommandVisibleInWorkspace(command: string, codeWorkspace: boolean) {
  return (
    codeWorkspace ||
    (!command.startsWith("terminal.") &&
      !command.startsWith("script.") &&
      !command.startsWith("pullRequest.") &&
      ![
        "diff.toggle",
        "composer.workspace",
        "composer.previousWorktree",
        "composer.branch",
        "editor.openFavorite",
      ].includes(command))
  );
}

export function isSettingsTargetVisibleInWorkspace(
  target: string | undefined,
  codeWorkspace: boolean,
) {
  if (!target || codeWorkspace) return true;
  const id = target.replace(/^#/, "");
  return (
    !CODE_SETTINGS_TARGETS.has(id) &&
    (!id.startsWith("keybinding-") ||
      isSettingsCommandVisibleInWorkspace(id.slice("keybinding-".length), false))
  );
}
