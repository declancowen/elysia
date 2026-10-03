import { randomUUID } from "../../lib/utils";
import { useState, type ReactNode } from "react";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { Edit03Icon, MoreHorizontalIcon, PinIcon, Trash2Icon } from "../../icons";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
  MenuRadioItem,
  MenuRadioGroup,
  MenuSeparator,
} from "../ui/menu";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  SidebarOrderedList,
  SidebarOrderedRow,
  SidebarSectionDragLabel,
} from "../sidebar/SidebarOrderedList";
import {
  orderAgents,
  removeAgentSection,
  toggleAgentPinned,
  useAgentSidebarPreferences,
  type AgentSection,
} from "./agentSidebarPreferences";
import type { AgentRosterEntry } from "./useAgents";

export const agentSidebarKey = (agent: AgentRosterEntry) =>
  scopedProjectKey(scopeProjectRef(agent.project.environmentId, agent.project.id));
export function AgentSectionDialog({
  section,
  onClose,
}: {
  section?: AgentSection;
  onClose: () => void;
}) {
  const [name, setName] = useState(section?.name ?? "");
  const save = () => {
    if (!name.trim()) return;
    useAgentSidebarPreferences.setState((s) => ({
      sections: section
        ? s.sections.map((item) => (item.id === section.id ? { ...item, name: name.trim() } : item))
        : [...s.sections, { id: randomUUID(), name: name.trim() }],
    }));
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <DialogHeader>
            <DialogTitle>{section ? "Rename section" : "New section"}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <label className="flex flex-col gap-2 text-sm">
              <span>Section name</span>
              <Input
                autoFocus
                aria-label="Section name"
                maxLength={80}
                value={name}
                onValueChange={setName}
              />
            </label>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {section ? "Save" : "Create section"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
export function AgentOrganizationMenuItems({ agent }: { agent: AgentRosterEntry }) {
  const key = agentSidebarKey(agent);
  const prefs = useAgentSidebarPreferences();
  return (
    <>
      <MenuItem onClick={() => toggleAgentPinned(key)}>
        <PinIcon />
        {prefs.pinned.includes(key) ? "Unpin" : "Pin"}{" "}
        {agent.project.agentProfile?.group ? "channel" : "agent"}
      </MenuItem>
      {prefs.sections.length ? (
        <>
          <MenuSeparator />
          <MenuRadioGroup
            value={prefs.assignment[key] ?? ""}
            onValueChange={(value) =>
              useAgentSidebarPreferences.setState((s) => ({
                assignment: { ...s.assignment, [key]: value },
              }))
            }
          >
            <MenuRadioItem value="">No section</MenuRadioItem>
            {prefs.sections.map((section) => (
              <MenuRadioItem value={section.id} key={section.id}>
                {section.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
        </>
      ) : null}
    </>
  );
}
export function AgentSidebarSections({
  agents,
  renderRow,
  updatedAt,
}: {
  agents: readonly AgentRosterEntry[];
  renderRow: (agent: AgentRosterEntry) => ReactNode;
  updatedAt?: (agent: AgentRosterEntry) => string;
}) {
  const prefs = useAgentSidebarPreferences();
  const [editing, setEditing] = useState<AgentSection | null>(null);
  const entries = agents.map((agent) => ({
    agent,
    key: agentSidebarKey(agent),
    name: agent.project.title,
    updated: updatedAt?.(agent) ?? agent.thread?.updatedAt ?? agent.project.updatedAt,
  }));
  const renderSection = (section: { id: string; name: string }) => {
    const rows = orderAgents(
      entries.filter((item) =>
        section.id === "pinned"
          ? prefs.pinned.includes(item.key)
          : !prefs.pinned.includes(item.key) && (prefs.assignment[item.key] ?? "") === section.id,
      ),
    );
    if (!rows.length && !section.name) return null;
    if (!rows.length && section.id === "pinned") return null;
    return (
      <section className="space-y-1" aria-label={section.name || "Agents"}>
        {section.name ? (
          <div className="flex min-h-8 items-center">
            {section.id === "pinned" ? (
              <span className="min-w-0 flex-1 truncate pl-2.5 text-xs text-sidebar-muted-foreground">
                {section.name}
              </span>
            ) : (
              <SidebarSectionDragLabel
                label={section.name}
                className="flex h-8 min-w-0 flex-1 cursor-pointer items-center truncate rounded-md px-2.5 text-left text-xs text-sidebar-muted-foreground"
              />
            )}
            {section.id !== "pinned" ? (
              <>
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Manage ${section.name}`}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuItem
                      onClick={() =>
                        setEditing(prefs.sections.find((item) => item.id === section.id) ?? null)
                      }
                    >
                      <Edit03Icon />
                      Rename section
                    </MenuItem>
                    <MenuItem onClick={() => removeAgentSection(section.id)}>
                      <Trash2Icon />
                      Delete section
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-1">
          {rows.map((item) => (
            <div key={item.key}>{renderRow(item.agent)}</div>
          ))}
        </div>
      </section>
    );
  };
  return (
    <>
      {renderSection({ id: "pinned", name: "Pinned" })}
      {renderSection({ id: "", name: "" })}
      <SidebarOrderedList
        ids={prefs.sections.map((section) => section.id)}
        onReorder={(ids) =>
          useAgentSidebarPreferences.setState((state) => ({
            sections: ids.flatMap((id) => state.sections.filter((section) => section.id === id)),
          }))
        }
      >
        <div className="space-y-2" role="list">
          {prefs.sections.map((section) => (
            <SidebarOrderedRow id={section.id} key={section.id}>
              {renderSection(section)}
            </SidebarOrderedRow>
          ))}
        </div>
      </SidebarOrderedList>
      {editing ? <AgentSectionDialog section={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
