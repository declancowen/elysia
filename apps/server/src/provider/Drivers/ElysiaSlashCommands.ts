import type { ServerProviderSkill, ServerProviderSlashCommand } from "@elysiatools/contracts";

// These open or configure Claude's terminal UI. Sending them as an SDK chat
// message cannot reproduce that UI; custom skills with these names still run.
const TERMINAL_COMMANDS = new Set([
  "add-dir",
  "agents",
  "config",
  "settings",
  "status",
  "theme",
  "model",
  "effort",
  "permissions",
  "allowed-tools",
  "mcp",
  "plugin",
  "plugins",
  "login",
  "logout",
  "upgrade",
  "resume",
  "rewind",
  "rename",
  "fork",
  "clear",
  "new",
  "exit",
  "quit",
  "terminal-setup",
  "vim",
  "memory",
  "help",
  "feedback",
  "bug",
  "remote-control",
  "rc",
  "desktop",
  "mobile",
  "teleport",
]);

export function elysiaChatSlashCommands(
  commands: ReadonlyArray<ServerProviderSlashCommand>,
  skills: ReadonlyArray<ServerProviderSkill>,
): ReadonlyArray<ServerProviderSlashCommand> {
  const skillsByName = new Map(skills.map((skill) => [skill.name.toLowerCase(), skill]));
  return commands.filter((command) => {
    const name = command.name.replace(/^\//, "").toLowerCase();
    const skill = skillsByName.get(name);
    if (skill) return skill.enabled && skill.userInvocable !== false;
    return !TERMINAL_COMMANDS.has(name);
  });
}
