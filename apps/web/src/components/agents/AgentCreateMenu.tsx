import { useState } from "react";
import { BotIcon, ChannelIcon, FolderPlusIcon, PlusIcon } from "../../icons";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { useSidebar } from "../ui/sidebar";
import { openAgentDialog } from "./agentDialogStore";
import { AgentGroupDialog } from "./AgentGroupDialog";
import { AgentSectionDialog } from "./AgentSidebarOrganization";
import { useAgents } from "./useAgents";

export function AgentCreateMenu({
  onCreate,
  small = false,
  sections = true,
}: {
  onCreate?: () => void;
  small?: boolean;
  sections?: boolean;
}) {
  const agents = useAgents();
  const { isMobile, setOpenMobile } = useSidebar();
  const [dialog, setDialog] = useState<"channel" | "section" | null>(null);
  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size={small ? "icon-xs" : "icon-sm"}
              aria-label="New agent, channel or section"
            />
          }
        >
          <PlusIcon />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem
            onClick={() => {
              onCreate?.();
              openAgentDialog();
              if (isMobile) setOpenMobile(false);
            }}
          >
            <BotIcon />
            New agent
          </MenuItem>
          <MenuItem
            onClick={() => {
              onCreate?.();
              setDialog("channel");
            }}
          >
            <ChannelIcon />
            New channel
          </MenuItem>
          {sections && (
            <MenuItem
              onClick={() => {
                onCreate?.();
                setDialog("section");
              }}
            >
              <FolderPlusIcon />
              New section
            </MenuItem>
          )}
        </MenuPopup>
      </Menu>
      {dialog === "channel" ? (
        <AgentGroupDialog agents={agents} onClose={() => setDialog(null)} />
      ) : dialog === "section" ? (
        <AgentSectionDialog onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}
