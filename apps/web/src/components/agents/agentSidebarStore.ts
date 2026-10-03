import { create } from "zustand";
import { isSidebarUtilityPage } from "../sidebar/mainAppLocation";

/** Agents owns its conversation list until Home or another app destination is chosen. */
export const useAgentSidebarStore = create<{ active: boolean }>(() => ({ active: false }));

export function setAgentSidebarActive(active: boolean) {
  useAgentSidebarStore.setState({ active });
}

export function agentSidebarActiveForPath(pathname: string, active: boolean) {
  if (pathname === "/agents" || pathname.startsWith("/agents/")) return true;
  return !isSidebarUtilityPage(pathname) && active;
}
