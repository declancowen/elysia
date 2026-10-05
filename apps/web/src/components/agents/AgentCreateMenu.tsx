import { useState } from "react";
import { BotIcon, ChannelIcon, FolderPlusIcon, PlusIcon } from "../../icons";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { useSidebar } from "../ui/sidebar";
import { openAgentDialog, openChannelDialog } from "./agentDialogStore";
import { AgentSectionDialog } from "./AgentSidebarOrganization";

export function AgentCreateMenu({
  onCreate,
  small = false,
  sections = true,
}: {
  onCreate?: () => void;
  small?: boolean;
  sections?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [dialog, setDialog] = useState<"section" | null>(null);
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
              openChannelDialog();
              if (isMobile) setOpenMobile(false);
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
      {dialog === "section" ? <AgentSectionDialog onClose={() => setDialog(null)} /> : null}
    </>
  );
}
