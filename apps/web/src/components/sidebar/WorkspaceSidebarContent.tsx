import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const WorkspaceSidebarContentContext = createContext<{
  host: HTMLDivElement | null;
  setHost: (host: HTMLDivElement | null) => void;
} | null>(null);

export function WorkspaceSidebarContentProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ host, setHost }), [host]);
  return <WorkspaceSidebarContentContext value={value}>{children}</WorkspaceSidebarContentContext>;
}

export function WorkspaceSidebarContentHost() {
  const context = useContext(WorkspaceSidebarContentContext);
  return <div ref={context?.setHost} className="flex min-h-0 flex-1 flex-col" />;
}

export function WorkspaceSidebarContent({ children }: { children: ReactNode }) {
  const context = useContext(WorkspaceSidebarContentContext);
  return context?.host ? createPortal(children, context.host) : null;
}
