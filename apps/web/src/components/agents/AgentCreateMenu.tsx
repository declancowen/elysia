import { BotIcon, ChannelIcon, FolderPlusIcon, PlusIcon } from "../../icons";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { useSidebar } from "../ui/sidebar";
import { openAgentDialog, openChannelDialog, useAgentDialogStore } from "./agentDialogStore";
import { useSidebarHoverPreview } from "../sidebar/SidebarHoverPreview";

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
  const hover = useSidebarHoverPreview();
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
              hover?.close();
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
              hover?.close();
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
                useAgentDialogStore.setState({ sectionDialogOpen: true });
                hover?.close();
              }}
            >
              <FolderPlusIcon />
              New section
            </MenuItem>
          )}
        </MenuPopup>
      </Menu>
    </>
  );
}
