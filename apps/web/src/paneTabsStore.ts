import { create } from "zustand";
import { randomUUID } from "./lib/utils";

export interface PaneTab<T> {
  id: string;
  target: T;
}

export interface PaneTabsState<T> {
  tabs: PaneTab<T>[];
  activeId: string | null;
  open: (target: T, newTab?: boolean) => void;
  isOpen: (target: T) => boolean;
  activate: (id: string | null) => void;
  close: (id: string) => T | null;
  retarget: (previous: T, target: T) => void;
  forget: (target: T) => T | null;
}

/** Each pane owns its session navigation; content remains in the existing domain stores. */
export function createPaneTabsStore<T>(targetKey: (target: T) => string) {
  return create<PaneTabsState<T>>((set, get) => ({
    tabs: [],
    activeId: null,
    isOpen: (target) => get().tabs.some((tab) => targetKey(tab.target) === targetKey(target)),
    open: (target, newTab = false) => {
      const { tabs, activeId } = get();
      const active = tabs.find((tab) => tab.id === activeId);
      const existing =
        active && targetKey(active.target) === targetKey(target)
          ? active
          : tabs.find((tab) => targetKey(tab.target) === targetKey(target));
      if (existing) {
        if (existing.id !== activeId) set({ activeId: existing.id });
      } else if (!newTab && active) {
        set({ tabs: tabs.map((tab) => (tab.id === activeId ? { ...tab, target } : tab)) });
      } else {
        const tab = { id: randomUUID(), target };
        set({ tabs: [...tabs, tab], activeId: tab.id });
      }
    },
    activate: (id) => {
      if (id === null || get().tabs.some((tab) => tab.id === id)) set({ activeId: id });
    },
    close: (id) => {
      const { tabs, activeId } = get();
      const index = tabs.findIndex((tab) => tab.id === id);
      if (index <= 0) return null;
      const remaining = tabs.filter((tab) => tab.id !== id);
      const next = remaining[Math.min(index, remaining.length - 1)]!;
      set({ tabs: remaining, activeId: activeId === id ? next.id : activeId });
      return activeId === id ? next.target : null;
    },
    retarget: (previous, target) => {
      const { tabs, activeId } = get();
      if (!tabs.some((tab) => targetKey(tab.target) === targetKey(previous))) return;
      const updated = tabs.map((tab) =>
        targetKey(tab.target) === targetKey(previous) ? { ...tab, target } : tab,
      );
      const unique = updated.filter(
        (tab, index) =>
          updated.findIndex((other) => targetKey(other.target) === targetKey(tab.target)) === index,
      );
      const activeTarget = updated.find((tab) => tab.id === activeId)?.target;
      set({
        tabs: unique,
        activeId:
          unique.find(
            (tab) =>
              activeTarget !== undefined && targetKey(tab.target) === targetKey(activeTarget),
          )?.id ??
          unique[0]?.id ??
          null,
      });
    },
    forget: (target) => {
      const { tabs, activeId } = get();
      const remaining = tabs.filter((tab) => targetKey(tab.target) !== targetKey(target));
      if (remaining.length === tabs.length) return null;
      const activeRemains = remaining.some((tab) => tab.id === activeId);
      const next = remaining[0];
      set({ tabs: remaining, activeId: activeRemains ? activeId : (next?.id ?? null) });
      return activeRemains ? null : (next?.target ?? null);
    },
  }));
}
