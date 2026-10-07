import { useId, useState } from "react";
import { isElectron } from "../../env";
import { SearchIcon } from "../../icons";
import { useAllEnvironmentProjectSnapshotsReady } from "../../state/entities";
import {
  SidebarCommandShortcut,
  SidebarChromeFooter,
  SidebarChromeHeader,
} from "../sidebar/SidebarChrome";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { SidebarContent } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { AgentConversationList } from "./AgentConversationList";
import { AgentCreateMenu } from "./AgentCreateMenu";
import { useAgents } from "./useAgents";

export function AgentsSidebar({ preview = false }: { preview?: boolean }) {
  const searchId = useId();
  const agents = useAgents();
  const ready = useAllEnvironmentProjectSnapshotsReady();
  const [query, setQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  return (
    <>
      <SidebarChromeHeader
        isElectron={isElectron}
        title="Agents"
        search={
          <div className="flex items-center gap-1">
            <SidebarCommandShortcut />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Toggle agent search"
                    aria-expanded={searchVisible}
                    aria-controls={searchId}
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
            <AgentCreateMenu />
          </div>
        }
      />
      {searchVisible && (
        <div id={searchId} className="shrink-0 px-3 pt-2 pb-4">
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
      </SidebarContent>
      {!preview ? <SidebarChromeFooter /> : null}
    </>
  );
}
