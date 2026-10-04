import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AgentSection {
  id: string;
  name: string;
}
interface AgentSidebarPreferences {
  pinned: string[];
  sections: AgentSection[];
  assignment: Record<string, string>;
  hideEmptySection: boolean;
}
const defaults: AgentSidebarPreferences = {
  pinned: [],
  sections: [],
  assignment: {},
  hideEmptySection: false,
};
const strings = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string"))] : [];
export function parseAgentSidebarPreferences(value: unknown): AgentSidebarPreferences {
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Record<string, unknown>;
  const sections: AgentSection[] = [];
  if (Array.isArray(raw.sections))
    for (const value of raw.sections as unknown[]) {
      if (!value || typeof value !== "object") continue;
      const section = value as Record<string, unknown>;
      if (
        section &&
        typeof section.id === "string" &&
        section.id.trim() !== "" &&
        section.id !== "pinned" &&
        typeof section.name === "string" &&
        section.name.trim() &&
        !sections.some((s) => s.id === section.id)
      )
        sections.push({
          id: section.id,
          name: section.name.trim().slice(0, 80),
        });
    }
  return {
    pinned: strings(raw.pinned),
    sections,
    assignment:
      raw.assignment && typeof raw.assignment === "object"
        ? Object.fromEntries(
            Object.entries(raw.assignment).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string" && sections.some((s) => s.id === entry[1]),
            ),
          )
        : {},
    hideEmptySection: raw.hideEmptySection === true,
  };
}
export const useAgentSidebarPreferences = create<AgentSidebarPreferences>()(
  persist(() => defaults, {
    name: "elysia:agent-sidebar:v1",
    merge: (saved, current) => ({ ...current, ...parseAgentSidebarPreferences(saved) }),
  }),
);
export function toggleAgentPinned(key: string) {
  useAgentSidebarPreferences.setState((s) => ({
    pinned: s.pinned.includes(key) ? s.pinned.filter((k) => k !== key) : [...s.pinned, key],
  }));
}
/** Reorders the visible pins without losing archived or search-hidden pins. */
export function reorderAgentPins(ids: readonly string[]) {
  useAgentSidebarPreferences.setState((state) => {
    const moved = new Set(ids);
    if (moved.size !== ids.length || ids.some((id) => !state.pinned.includes(id))) return state;
    let index = 0;
    return { pinned: state.pinned.map((id) => (moved.has(id) ? ids[index++]! : id)) };
  });
}
export function removeAgentSection(id: string) {
  useAgentSidebarPreferences.setState((s) => ({
    sections: s.sections.filter((section) => section.id !== id),
    assignment: Object.fromEntries(
      Object.entries(s.assignment).filter(([, section]) => section !== id),
    ),
  }));
}
export function orderAgents<T extends { key: string; name: string; updated: string }>(
  items: readonly T[],
): T[] {
  return items.toSorted(
    (a, b) =>
      b.updated.localeCompare(a.updated) ||
      a.name.localeCompare(b.name) ||
      a.key.localeCompare(b.key),
  );
}
