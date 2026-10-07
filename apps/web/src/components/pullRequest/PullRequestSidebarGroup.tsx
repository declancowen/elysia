import type { ReactNode } from "react";
import { SidebarSectionHeader, useSidebarSectionExpansion } from "../sidebar/SidebarSectionHeader";

export function PullRequestSidebarGroup({
  group,
  children,
}: {
  group: { key: string; label: string | null; entries: readonly unknown[] };
  children: ReactNode;
}) {
  const { expanded, setExpanded } = useSidebarSectionExpansion(
    `sidebar-pull-requests:${group.key}`,
  );
  return (
    <section className="space-y-1">
      {group.label ? (
        <SidebarSectionHeader
          label={group.label}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        >
          <span className="px-2 text-xs text-sidebar-foreground/70">{group.entries.length}</span>
        </SidebarSectionHeader>
      ) : null}
      {!group.label || expanded ? children : null}
    </section>
  );
}
