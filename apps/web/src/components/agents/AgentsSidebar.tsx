import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { isElectron } from "../../env";
import { ArchiveIcon, BotIcon, PlusIcon, SearchIcon, UsersIcon } from "../../icons";
import { useAllEnvironmentProjectSnapshotsReady } from "../../state/entities";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { SidebarContent, useSidebar } from "../ui/sidebar";
import { AgentConversationList } from "./AgentConversationList";
import { AgentGroupDialog } from "./AgentGroupDialog";
import { openAgentDialog } from "./agentDialogStore";
import { useAgents } from "./useAgents";

export function AgentsSidebar() {
  const agents = useAgents();
  const ready = useAllEnvironmentProjectSnapshotsReady();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const [query, setQuery] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <h2 className="text-base font-medium">Agents</h2>
        <Menu>
          <MenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="New agent or channel" />}
          >
            <PlusIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem
              onClick={() => {
                openAgentDialog();
                if (isMobile) setOpenMobile(false);
              }}
            >
              <BotIcon />
              New agent
            </MenuItem>
            <MenuItem onClick={() => setCreatingGroup(true)}>
              <UsersIcon />
              New channel
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
      <div className="shrink-0 px-3 pb-2">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search agents"
            placeholder="Search agents"
            value={query}
            onValueChange={setQuery}
          />
        </InputGroup>
      </div>
      <SidebarContent>
        <section aria-label="Agent conversations" className="px-1">
          <AgentConversationList agents={agents} ready={ready} query={query} />
        </section>
        <div className="px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (isMobile) setOpenMobile(false);
              void navigate({ to: "/settings/archived" });
            }}
          >
            <ArchiveIcon />
            Archived agents
          </Button>
        </div>
      </SidebarContent>
      <SidebarChromeFooter />
      {creatingGroup ? (
        <AgentGroupDialog agents={agents} onClose={() => setCreatingGroup(false)} />
      ) : null}
    </>
  );
}
