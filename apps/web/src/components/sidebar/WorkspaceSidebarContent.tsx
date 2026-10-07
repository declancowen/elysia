import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const WorkspaceSidebarContentContext = createContext<{
  host: HTMLDivElement | null;
  floatingHost: HTMLDivElement | null;
  setFloatingHost: (host: HTMLDivElement | null) => void;
  setHost: (host: HTMLDivElement | null) => void;
} | null>(null);

export function WorkspaceSidebarContentProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [floatingHost, setFloatingHost] = useState<HTMLDivElement | null>(null);
  const value = useMemo(
    () => ({ host, setHost, floatingHost, setFloatingHost }),
    [host, floatingHost],
  );
  return <WorkspaceSidebarContentContext value={value}>{children}</WorkspaceSidebarContentContext>;
}

export function WorkspaceSidebarContentHost({ floating = false }: { floating?: boolean }) {
  const context = useContext(WorkspaceSidebarContentContext);
  return (
    <div
      ref={floating ? context?.setFloatingHost : context?.setHost}
      className="flex min-h-0 flex-1 flex-col"
    />
  );
}

export function WorkspaceSidebarContent({ children }: { children: ReactNode }) {
  const context = useContext(WorkspaceSidebarContentContext);
  const host = context?.floatingHost ?? context?.host;
  return host ? createPortal(children, host) : null;
}
