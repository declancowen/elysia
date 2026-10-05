import type { ReactNode } from "react";

export function WorkspaceSurfaceHeader({
  title,
  actions,
  divider = true,
}: {
  title: ReactNode;
  actions?: ReactNode;
  divider?: boolean;
}) {
  return (
    <header
      className={`flex min-h-14 shrink-0 items-center gap-3 px-6 py-2${divider ? " border-b border-border/50" : ""}`}
    >
      <div className="shrink-0">
        {typeof title === "string" ? <h1 className="text-xl font-medium">{title}</h1> : title}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}
