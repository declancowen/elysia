import type { ServerProviderSkill } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { elysiaChatSlashCommands } from "./ElysiaSlashCommands.ts";

describe("elysiaChatSlashCommands", () => {
  it("keeps native chat commands and Elysia/plugin commands while hiding terminal settings", () => {
    const names = [
      "compact",
      "context",
      "elysia-config",
      "elysia-model",
      "elysia-compression",
      "team:theme",
      "review",
      "config",
      "settings",
      "/status",
      "theme",
      "model",
      "permissions",
      "mcp",
      "plugin",
      "exit",
    ];
    expect(
      elysiaChatSlashCommands(
        names.map((name) => ({ name })),
        [],
      ),
    ).toEqual(names.slice(0, 7).map((name) => ({ name })));
  });

  it("honors native invocation settings and preserves a real custom command sharing a UI name", () => {
    const skills: ServerProviderSkill[] = [
      { name: "config", path: "/claude/commands/config.md", enabled: true },
      {
        name: "hidden",
        path: "/claude/skills/hidden/SKILL.md",
        enabled: true,
        userInvocable: false,
      },
      { name: "off", path: "/claude/skills/off/SKILL.md", enabled: false },
    ];
    expect(
      elysiaChatSlashCommands(
        [
          { name: "config", description: "Configure this project" },
          { name: "hidden" },
          { name: "off" },
          { name: "review", input: { hint: "[changes]" } },
        ],
        skills,
      ),
    ).toEqual([
      { name: "config", description: "Configure this project" },
      { name: "review", input: { hint: "[changes]" } },
    ]);
  });
});
