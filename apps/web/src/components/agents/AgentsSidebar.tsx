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
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
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
  const [searchVisible, setSearchVisible] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  return (
    <>
      <SidebarChromeHeader
        isElectron={isElectron}
        title="Agents"
        search={
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Toggle agent search"
                    aria-expanded={searchVisible}
                    aria-controls="agent-search"
                    onClick={() => {
                      setSearchVisible((visible) => !visible);
                      setQuery("");
                    }}
                  />
                }
              >
                <SearchIcon />
              </TooltipTrigger>
              <TooltipPopup side="bottom">Search agents</TooltipPopup>
            </Tooltip>
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
        }
      />
      {searchVisible && (
        <div id="agent-search" className="shrink-0 px-3 pt-2 pb-4">
          <InputGroup variant="filled">
            <InputGroupAddon>
              <SearchIcon className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              autoFocus
              aria-label="Search agents"
              placeholder="Search agents"
              value={query}
              onValueChange={setQuery}
            />
          </InputGroup>
        </div>
      )}
      <SidebarContent>
        <section aria-label="Agent conversations" className="px-2">
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
