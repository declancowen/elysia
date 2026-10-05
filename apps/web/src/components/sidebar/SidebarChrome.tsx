import { useConversationSectionNavigation } from "../../hooks/useConversationTabNavigation";
import { SINGLE_PROVIDER_UI } from "@t3tools/contracts";
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  Code2,
  ChartNoAxesColumnIncreasingIcon,
  SettingsIcon,
  Columns2Icon,
  PanelLeftIcon,
  SearchIcon,
  SquarePenIcon,
  Home,
  BotIcon,
  ClockIcon,
  TaskEdit02Icon,
  Files01Icon,
  FolderIcon,
} from "~/icons";
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import { useAtomValue } from "@effect/atom-react";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { shortcutLabelForCommand } from "../../keybindings";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import {
  useClientSettings,
  useCodeWorkspace,
  useUpdateClientSettings,
  useEnvironmentIdentificationMode,
} from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useScratchProject } from "../../hooks/useScratchProject";
import { useRecentThreadsExpansion } from "./RecentThreadsHeader";
import { CommandDialogTrigger } from "../ui/command";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { ElysiaWordmark } from "../Icons";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import {
  agentSidebarActiveForPath,
  setAgentSidebarActive,
  useAgentSidebarStore,
} from "../agents/agentSidebarStore";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
  search,
  title,
}: {
  isElectron: boolean;
  search?: ReactNode;
  title?: string;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    !SINGLE_PROVIDER_UI && environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    !SINGLE_PROVIDER_UI && environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <div
      className={cn(
        "@container/sidebar-header relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 px-3",
        SINGLE_PROVIDER_UI ? "md:h-11" : "md:px-0",
        isElectron && !SINGLE_PROVIDER_UI && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        // Over the stage artwork: the media viewer's control-on-imagery treatment.
        variant={backdropVariant ? "media-navigation" : "ghost"}
        className="relative top-auto z-10 translate-y-0 md:hidden"
      />
      <div
        className={cn(
          "@container/sidebar-brand relative z-10 flex min-w-0 flex-1 items-center gap-2",
          !SINGLE_PROVIDER_UI && "md:ml-[var(--workspace-titlebar-content-left)]",
        )}
      >
        {SINGLE_PROVIDER_UI ? (
          <h2 className="min-w-0 flex-1 truncate pl-1.5 text-base font-medium">
            {title ?? "Workspace"}
          </h2>
        ) : (
          <SidebarBrand onBackdrop={backdropVariant !== null} />
        )}
        <div
          className={cn(
            "[-webkit-app-region:no-drag] flex items-center justify-end gap-1",
            SINGLE_PROVIDER_UI ? "shrink-0" : "min-w-0 flex-1",
          )}
        >
          {search}
          {SINGLE_PROVIDER_UI && !title ? <SidebarThreadViewSwitcher /> : null}
        </div>
      </div>
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 hidden @[15rem]/sidebar-header:inline-flex"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
    </div>
  );
});

function SidebarThreadViewSwitcher() {
  const projectSidebar = useClientSettings((settings) => settings.legacySidebarEnabled);
  const updateClientSettings = useUpdateClientSettings();
  const label = projectSidebar ? "Switch to Thread view" : "Switch to Project view";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={() => void updateClientSettings({ legacySidebarEnabled: !projectSidebar })}
          >
            {projectSidebar ? <Columns2Icon /> : <PanelLeftIcon />}
          </Button>
        }
      />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "relative z-10 h-7 w-fit shrink-0 items-center rounded-md outline-hidden ring-ring focus-visible:ring-2",
        SINGLE_PROVIDER_UI ? "flex" : "hidden md:@[10rem]/sidebar-brand:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
      onClick={() => setAgentSidebarActive(false)}
    >
      <ElysiaWordmark aria-label="Elysia" className="h-5 w-auto shrink-0" />
    </Link>
  );
}

export function SidebarCommandShortcut({
  shortcutLabel,
}: {
  shortcutLabel?: string | null | undefined;
}) {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const label = shortcutLabel ?? shortcutLabelForCommand(keybindings, "commandPalette.toggle");
  return label ? (
    <CommandDialogTrigger
      render={<Button variant="ghost" size="xs" aria-label="Open command palette" />}
    >
      <Kbd>{label}</Kbd>
    </CommandDialogTrigger>
  ) : null;
}

export function SidebarHeaderSearch({ shortcutLabel }: { shortcutLabel?: string | null }) {
  return (
    <div className="flex items-center gap-1">
      <SidebarCommandShortcut shortcutLabel={shortcutLabel} />
      <CommandDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Search"
            data-testid="command-palette-trigger"
          />
        }
      >
        <SearchIcon />
      </CommandDialogTrigger>
    </div>
  );
}

export function SidebarNewChatButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const environmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const { setExpanded } = useRecentThreadsExpansion();
  const { isMobile, setOpenMobile } = useSidebar();
  const target = scratchEnvironmentId(environmentId);
  const createChat = () => {
    if (target === null) return;
    setExpanded(true);
    if (isMobile) setOpenMobile(false);
    void startScratchThread(target);
  };
  if (iconOnly)
    return (
      <Button
        variant="ghost-muted"
        size="icon-sm"
        aria-label="New chat"
        disabled={target === null}
        onClick={createChat}
      >
        <SquarePenIcon />
      </Button>
    );
  return (
    <SidebarMenuButton aria-label="New chat" disabled={target === null} onClick={createChat}>
      <SquarePenIcon />
      <span>New chat</span>
    </SidebarMenuButton>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const codeWorkspace = useCodeWorkspace();
  const navigate = useNavigate();
  const projectSidebar = useClientSettings((settings) => settings.legacySidebarEnabled);
  const updateClientSettings = useUpdateClientSettings();
  const navigateToMainApp = useNavigateToMainApp();
  const navigateToTabSection = useConversationSectionNavigation();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isOnUtilityPage = isSidebarUtilityPage(pathname);
  const isOnSettingsPage =
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname.startsWith("/projects/");
  const hideWorkspaceControls = isOnSettingsPage || pathname === "/usage";
  const { environments } = useEnvironments();
  // The page reads every connected server, so one of them offering pull requests is enough for
  // the link to lead somewhere.
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handlePullRequestsClick = useCallback(() => {
    closeMobileSidebar();
    if (SINGLE_PROVIDER_UI && navigateToTabSection("pull-requests")) return;
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  }, [closeMobileSidebar, navigate, navigateToTabSection]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  const handleBackClick = useCallback(() => {
    closeMobileSidebar();
    if (SINGLE_PROVIDER_UI && navigateToTabSection("workspace")) return;
    void navigateToMainApp();
  }, [closeMobileSidebar, navigateToMainApp, navigateToTabSection]);

  return (
    <SidebarMenu
      className={cn("flex-row items-center justify-between", SINGLE_PROVIDER_UI && "md:hidden")}
    >
      {isOnUtilityPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
      {!isOnSettingsPage ? (
        <SidebarUtilityItem
          icon={<SettingsIcon />}
          label="Settings"
          onClick={handleSettingsClick}
        />
      ) : null}
      {!hideWorkspaceControls ? (
        <SidebarUtilityItem
          icon={codeWorkspace ? <Code2 /> : <BriefcaseIcon />}
          label={
            codeWorkspace ? "Code workspace · Switch to Work" : "Work workspace · Switch to Code"
          }
          onClick={() => {
            void updateClientSettings({ workspaceMode: codeWorkspace ? "work" : "code" });
          }}
        />
      ) : null}
      {!isOnUtilityPage ? (
        <>
          <SidebarUtilityItem
            icon={<ChartNoAxesColumnIncreasingIcon />}
            label="Stats"
            onClick={handleUsageClick}
          />
        </>
      ) : null}
      {!hideWorkspaceControls ? (
        <SidebarUtilityItem
          icon={projectSidebar ? <Columns2Icon /> : <PanelLeftIcon />}
          label={projectSidebar ? "Switch to Thread view" : "Switch to Project view"}
          onClick={() => {
            void updateClientSettings({ legacySidebarEnabled: !projectSidebar });
          }}
        />
      ) : null}
      {!isOnUtilityPage && codeWorkspace && pullRequestsSupported ? (
        <SidebarUtilityItem
          icon={<PullRequestGlyph.pullRequest />}
          label="Pull Requests"
          onClick={handlePullRequestsClick}
        />
      ) : null}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const { isMobile } = useSidebar();
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      {!SINGLE_PROVIDER_UI ? <SidebarProviderUpdatePill /> : null}
      <SidebarUpdateArchitectureWarning />
      {!SINGLE_PROVIDER_UI || isMobile ? <SidebarUtilityMenu /> : null}
    </SidebarFooter>
  );
});

function AppRailButton({
  label,
  icon,
  active = false,
  onClick,
  onIntent,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
  onIntent?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-current={active ? "page" : undefined}
            size="icon-xl"
            variant={active ? "secondary" : "ghost-muted"}
            onClick={onClick}
            onPointerEnter={onIntent}
            onFocus={onIntent}
          >
            {icon}
          </Button>
        }
      />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

export const AppNavigationRail = memo(function AppNavigationRail() {
  const navigate = useNavigate();
  const router = useRouter();
  const { setOpen } = useSidebar();
  const navigateToMainApp = useNavigateToMainApp();
  const navigateToTabSection = useConversationSectionNavigation();
  const pathname = useLocation({ select: (location) => location.pathname });
  const codeWorkspace = useCodeWorkspace();
  const editingAgent = useLocation({
    select: (location) =>
      location.pathname === "/agents" &&
      (location.search.create === true || Boolean(location.search.projectId)),
  });
  const agentSidebarSelected = useAgentSidebarStore((state) => state.active);
  const agentsActive = agentSidebarActiveForPath(pathname, agentSidebarSelected, editingAgent);
  const updateClientSettings = useUpdateClientSettings();
  const { environments } = useEnvironments();
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );

  return (
    <aside
      aria-label="App navigation"
      className="relative z-20 hidden w-[var(--app-navigation-rail-width)] shrink-0 flex-col items-center justify-between gap-2 bg-sidebar pt-2 md:flex"
    >
      <nav aria-label="Workspace pages" className="flex flex-col items-center gap-2">
        <AppRailButton
          label="Workspace"
          icon={<Home className="size-5" />}
          active={
            !agentsActive &&
            !isSidebarUtilityPage(pathname) &&
            pathname !== "/agents" &&
            !pathname.startsWith("/agents/")
          }
          onClick={() => {
            setAgentSidebarActive(false);
            if (navigateToTabSection("workspace")) return;
            void navigateToMainApp();
          }}
        />
        <AppRailButton
          label="Agents"
          onIntent={() => void router.preloadRoute({ to: "/agents", search: {} })}
          icon={<BotIcon className="size-5" />}
          active={agentsActive}
          onClick={() => {
            setAgentSidebarActive(true);
            setOpen(true);
            if (navigateToTabSection("agents")) return;
            void navigate({ to: "/agents", search: {} });
          }}
        />
        <AppRailButton
          label="Pages"
          icon={<Files01Icon className="size-5" />}
          active={pathname === "/pages" || pathname.startsWith("/pages/")}
          onIntent={() => void router.preloadRoute({ to: "/pages" })}
          onClick={() => {
            setAgentSidebarActive(false);
            void navigate({ to: "/pages" });
          }}
        />
        <AppRailButton
          label="Tasks"
          icon={<TaskEdit02Icon className="size-5" />}
          active={pathname === "/tasks"}
          onIntent={() => void router.preloadRoute({ to: "/tasks", search: {} })}
          onClick={() => {
            setAgentSidebarActive(false);
            void navigate({ to: "/tasks", search: {} });
          }}
        />
        <AppRailButton
          label="Scheduled"
          onIntent={() => void router.preloadRoute({ to: "/settings/scheduled-tasks" })}
          icon={<ClockIcon className="size-5" />}
          active={pathname === "/settings/scheduled-tasks"}
          onClick={() => {
            setAgentSidebarActive(false);
            void navigate({ to: "/settings/scheduled-tasks" });
          }}
        />
        <AppRailButton
          label="Projects"
          onIntent={() => void router.preloadRoute({ to: "/projects" })}
          icon={<FolderIcon className="size-5" />}
          active={pathname === "/projects" || pathname.startsWith("/projects/")}
          onClick={() => {
            setAgentSidebarActive(false);
            void navigate({ to: "/projects" });
          }}
        />
        {codeWorkspace && pullRequestsSupported ? (
          <AppRailButton
            label="Pull requests"
            onIntent={() =>
              void router.preloadRoute({
                to: "/pull-requests",
                search: readPullRequestListPreferences(),
              })
            }
            icon={<PullRequestGlyph.pullRequest className="size-5" />}
            active={pathname === "/pull-requests"}
            onClick={() => {
              setAgentSidebarActive(false);
              if (navigateToTabSection("pull-requests")) return;
              void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() });
            }}
          />
        ) : null}
      </nav>
      <div aria-label="Workspace controls" className="flex flex-col items-center gap-2">
        <AppRailButton
          label="Settings"
          onIntent={() => void router.preloadRoute({ to: "/settings" })}
          icon={<SettingsIcon className="size-5" />}
          active={pathname.startsWith("/settings") && pathname !== "/settings/scheduled-tasks"}
          onClick={() => {
            setAgentSidebarActive(false);
            void navigate({ to: "/settings" });
          }}
        />
        <AppRailButton
          label={
            codeWorkspace ? "Code workspace · Switch to Work" : "Work workspace · Switch to Code"
          }
          icon={codeWorkspace ? <Code2 className="size-5" /> : <BriefcaseIcon className="size-5" />}
          onClick={() =>
            void updateClientSettings({ workspaceMode: codeWorkspace ? "work" : "code" })
          }
        />
        <AppRailButton
          label="Stats"
          onIntent={() => void router.preloadRoute({ to: "/usage" })}
          icon={<ChartNoAxesColumnIncreasingIcon className="size-5" />}
          active={pathname === "/usage"}
          onClick={() => {
            setAgentSidebarActive(false);
            void navigate({ to: "/usage" });
          }}
        />
        <ul className="flex size-10 items-center justify-center">
          <SidebarUpdatePill />
        </ul>
      </div>
    </aside>
  );
});
