import { Fragment, useState, useSyncExternalStore, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Button } from "./components/ui/button";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
  MenuGroupLabel,
  MenuGroup,
  MenuCheckboxItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
} from "./components/ui/menu";
import type { ContextMenuItem, AgentProfile } from "@elysiatools/contracts";
import {
  AGENT_AVATAR_COLORS,
  AGENT_AVATAR_SHAPES,
  resolveAgentAvatar,
} from "@elysiatools/shared/agentAvatar";
import { AgentAvatar } from "./components/agents/AgentAvatar";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ArchiveIcon,
  BubblesIcon,
  ChannelIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  CircleXIcon,
  ClockIcon,
  ClipboardIcon,
  CopyIcon,
  DownloadIcon,
  Edit03Icon,
  Files01Icon,
  FolderClosedIcon,
  FolderFileStorageIcon,
  FolderIcon,
  FolderTreeIcon,
  GitBranchIcon,
  Link2Icon,
  MailIcon,
  MessageSquareIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  SquareArrowOutUpRightIcon,
  TaskEdit02Icon,
  Trash2Icon,
  XIcon,
  Volume2,
  VolumeOff,
  type LucideIcon,
} from "./icons";

const MENU_ICONS: Record<string, LucideIcon> = {
  "open-new-tab": SquareArrowOutUpRightIcon,
  "edit-03": Edit03Icon,
  archive: ArchiveIcon,
  "arrow-up": ArrowUpIcon,
  "arrow-down": ArrowDownIcon,
  check: CheckIcon,
  timer: ClockIcon,
  "chevron-right": ChevronRightIcon,
  "circle-check": CircleCheckIcon,
  clock: ClockIcon,
  pencil: Edit03Icon,
  copy: CopyIcon,
  clipboard: ClipboardIcon,
  folder: FolderIcon,
  "git-branch": GitBranchIcon,
  hash: ChannelIcon,
  "mail-open": MailIcon,
  "message-square-plus": MessageSquareIcon,
  pin: PinIcon,
  "pin-off": PinOffIcon,
  "refresh-cw": RefreshCwIcon,
  settings: SettingsIcon,
  "folder-tree": FolderTreeIcon,
  trash: Trash2Icon,
  plus: PlusIcon,
  link: Link2Icon,
  download: DownloadIcon,
  close: XIcon,
  volume: Volume2,
  "volume-off": VolumeOff,
  "workspace-task": TaskEdit02Icon,
  "workspace-project": FolderClosedIcon,
  "workspace-folder": FolderFileStorageIcon,
  "workspace-page": Files01Icon,
  "workspace-assigned": BubblesIcon,
  "workspace-channel": ChannelIcon,
  "workspace-delete": Trash2Icon,
  "task-backlog": CircleDashedIcon,
  "task-todo": CircleIcon,
  "task-in_progress": CircleDotIcon,
  "task-done": CircleCheckIcon,
  "task-canceled": CircleXIcon,
};

export function contextMenuAgentIcon(avatar: AgentProfile["avatar"]) {
  const { preset, color } = resolveAgentAvatar(avatar);
  return `agent-avatar:${preset}:${color}`;
}

function ContextMenuIcon({ name }: { name: string }) {
  const [, presetName, colorName] = name.startsWith("agent-avatar:") ? name.split(":") : [];
  const preset = AGENT_AVATAR_SHAPES.find((entry) => entry.value === presetName)?.value;
  const color = AGENT_AVATAR_COLORS.find((entry) => entry === colorName);
  if (preset && color) return <AgentAvatar avatar={{ preset, color }} animated={false} />;
  const Icon = MENU_ICONS[name];
  return Icon ? <Icon /> : null;
}

function ContextMenuItems<T extends string>({
  items,
  select,
  registerPopup,
}: {
  items: readonly ContextMenuItem<T>[];
  select: (id: T) => void;
  registerPopup: (element: HTMLDivElement | null) => void;
}) {
  return (
    <MenuGroup>
      {items.map((item, index) => {
        const content = (
          <>
            {item.icon ? <ContextMenuIcon name={item.icon} /> : null}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </>
        );
        return (
          <Fragment key={item.id}>
            {index > 0 && item.separatorBefore ? <MenuSeparator /> : null}
            {item.header ? (
              <MenuGroupLabel>{item.label}</MenuGroupLabel>
            ) : item.children?.length ? (
              <MenuSub>
                <MenuSubTrigger disabled={item.disabled}>{content}</MenuSubTrigger>
                <MenuSubPopup ref={registerPopup}>
                  <ContextMenuItems
                    items={item.children}
                    select={select}
                    registerPopup={registerPopup}
                  />
                </MenuSubPopup>
              </MenuSub>
            ) : typeof item.checked === "boolean" ? (
              <MenuCheckboxItem
                checked={item.checked}
                disabled={item.disabled}
                closeOnClick={false}
                onClick={() => select(item.id)}
              >
                {content}
              </MenuCheckboxItem>
            ) : (
              <MenuItem
                disabled={item.disabled}
                closeOnClick={false}
                variant={item.destructive || item.id === "delete" ? "destructive" : "default"}
                onClick={() => select(item.id)}
              >
                {content}
              </MenuItem>
            )}
          </Fragment>
        );
      })}
    </MenuGroup>
  );
}

let activeContextMenu: { dismiss: () => void; previousFocus: HTMLElement | null } | null = null;

const contextMenuListeners = new Set<() => void>();
function getActiveContextMenu() {
  return activeContextMenu;
}
function subscribeContextMenu(listener: () => void) {
  contextMenuListeners.add(listener);
  return () => {
    contextMenuListeners.delete(listener);
  };
}
function notifyContextMenuChange() {
  for (const listener of contextMenuListeners) listener();
}

export function isContextMenuOpen(): boolean {
  return activeContextMenu !== null;
}

export function dismissContextMenu(): void {
  activeContextMenu?.dismiss();
}

/** Imperative entry point using the same menu primitives as button menus. */
export function showContextMenuFallback<T extends string>(
  items: readonly ContextMenuItem<T>[],
  position = { x: 0, y: 0 },
): Promise<T | null> {
  const previousFocus =
    activeContextMenu?.previousFocus ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  dismissContextMenu();
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const popups = new Set<HTMLDivElement>();
    const registerPopup = (element: HTMLDivElement | null) => {
      if (element) popups.add(element);
    };
    let disposed = false;
    let canSelect = false;
    const cleanup = (result: T | null) => {
      if (disposed) return;
      disposed = true;
      if (activeContextMenu?.dismiss === dismiss) {
        activeContextMenu = null;
        notifyContextMenuChange();
      }
      const restoreFocus =
        document.activeElement === document.body ||
        [...popups].some((popup) => popup.contains(document.activeElement));
      // Closing can be requested by a menu effect; unmount outside React's commit.
      queueMicrotask(() => {
        root.unmount();
        host.remove();
        if (restoreFocus && !activeContextMenu && previousFocus?.isConnected)
          previousFocus.focus({ preventScroll: true });
        resolve(result);
      });
    };
    const dismiss = () => cleanup(null);
    activeContextMenu = { dismiss, previousFocus };
    notifyContextMenuChange();
    flushSync(() =>
      root.render(
        <Menu
          open
          onOpenChange={(open) => {
            if (!open && canSelect) cleanup(null);
          }}
        >
          {/* The trigger registers the root for submenu navigation; the anchor below positions it. */}
          <MenuTrigger hidden tabIndex={-1} aria-hidden />
          <MenuPopup
            align="start"
            sideOffset={0}
            finalFocus={false}
            ref={registerPopup}
            anchor={{ getBoundingClientRect: () => new DOMRect(position.x, position.y, 0, 0) }}
          >
            <ContextMenuItems
              items={items}
              registerPopup={registerPopup}
              select={(id) => {
                if (canSelect) cleanup(id);
              }}
            />
          </MenuPopup>
        </Menu>,
      ),
    );
    requestAnimationFrame(() => {
      canSelect = true;
    });
  });
}

/** Both mouse and keyboard button activation use the row's context action list. */
export function ContextMenuButton({
  onOpen,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "onKeyDown"> & {
  onOpen: (position: { x: number; y: number }) => Promise<unknown>;
}) {
  const [invokedMenu, setInvokedMenu] = useState<typeof activeContextMenu>(null);
  const open = useSyncExternalStore(
    subscribeContextMenu,
    () => invokedMenu !== null && getActiveContextMenu() === invokedMenu,
    () => false,
  );
  return (
    <Button
      {...props}
      aria-haspopup="menu"
      aria-expanded={open}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const previousMenu = getActiveContextMenu();
        const action = onOpen({ x: rect.left, y: rect.bottom + 4 });
        const nextMenu = getActiveContextMenu();
        const invoked = nextMenu !== previousMenu ? nextMenu : null;
        setInvokedMenu(invoked);
        void action.finally(() =>
          setInvokedMenu((current) => (current === invoked ? null : current)),
        );
      }}
    />
  );
}
