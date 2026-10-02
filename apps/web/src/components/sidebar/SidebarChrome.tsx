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
} from "~/icons";
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";

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
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
  search,
}: {
  isElectron: boolean;
  search?: ReactNode;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    // The titlebar row, not a padded SidebarHeader: it aligns to the window controls.
    <div
      className={cn(
        "@container/sidebar-header relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 px-3 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        // Over the stage artwork: the media viewer's control-on-imagery treatment.
        variant={backdropVariant ? "media-navigation" : "ghost"}
        className="relative top-auto z-10 translate-y-0 md:hidden"
      />
      <div className="@container/sidebar-brand relative z-10 flex min-w-0 flex-1 items-center gap-2 md:ml-[var(--workspace-titlebar-content-left)]">
        <SidebarBrand onBackdrop={backdropVariant !== null} />
        <div className="[-webkit-app-region:no-drag] flex min-w-0 flex-1 justify-end pr-2">
          {search}
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

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "relative z-10 hidden h-7 w-fit shrink-0 items-center rounded-md outline-hidden ring-ring focus-visible:ring-2 md:@[10rem]/sidebar-brand:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <ElysiaWordmark aria-label="Elysia" className="h-5 w-auto shrink-0" />
    </Link>
  );
}

export function SidebarHeaderSearch({ shortcutLabel }: { shortcutLabel?: string | null }) {
  return (
    <div className="flex items-center gap-1">
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
      {shortcutLabel ? (
        <CommandDialogTrigger
          render={<Button variant="ghost" size="xs" aria-label="Open command palette" />}
        >
          <Kbd>{shortcutLabel}</Kbd>
        </CommandDialogTrigger>
      ) : null}
    </div>
  );
}

export function SidebarNewChatButton() {
  const environmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const { setExpanded } = useRecentThreadsExpansion();
  const { isMobile, setOpenMobile } = useSidebar();
  const target = scratchEnvironmentId(environmentId);
  return (
    <SidebarMenuButton
      aria-label="New chat"
      disabled={target === null}
      onClick={() => {
        if (target === null) return;
        setExpanded(true);
        if (isMobile) setOpenMobile(false);
        void startScratchThread(target);
      }}
    >
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
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  }, [closeMobileSidebar, navigate]);
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
    void navigateToMainApp();
  }, [closeMobileSidebar, navigateToMainApp]);

  return (
    <SidebarMenu className="flex-row items-center">
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
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      {!SINGLE_PROVIDER_UI ? <SidebarProviderUpdatePill /> : null}
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
