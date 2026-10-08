import type { AgentProfile } from "@elysiatools/contracts";
import { expect, it } from "vite-plus/test";
import { AGENT_AVATAR_SHAPES, resolveAgentAvatar } from "./agentAvatar.ts";

it("keeps every saved legacy preset and named colour readable without changing the record", () => {
  for (const preset of ["robot", "sparkles", "brain", "briefcase", "code", "planet"] as const) {
    for (const color of ["blue", "violet", "green", "orange", "rose", "cyan"] as const) {
      const avatar: AgentProfile["avatar"] = { preset, color };
      const character = resolveAgentAvatar(avatar);
      expect(character.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(character.path).toBeTruthy();
      expect(character.eyes).toHaveLength(2);
      expect(avatar).toEqual({ preset, color });
    }
  }
});

it("renders every approved character and keeps eyes in the shared frame on both clients", () => {
  expect(AGENT_AVATAR_SHAPES).toHaveLength(12);
  for (const { value } of AGENT_AVATAR_SHAPES) {
    const character = resolveAgentAvatar({ preset: value, color: "#28B4FF" });
    expect(character.preset).toBe(value);
    expect(character.color).toBe("#28B4FF");
    expect(character.path).toBeTruthy();
    for (const eye of character.eyes) {
      expect(eye.x).toBeGreaterThan(0);
      expect(eye.x).toBeLessThan(100);
      expect(eye.y).toBeGreaterThan(0);
      expect(eye.y).toBeLessThan(100);
    }
  }
});
