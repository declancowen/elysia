import { CONNECTIONS_ENABLED, UPSTREAM_ANALYTICS_ENABLED } from "@elysiatools/contracts";
import {
  createPathConfigForStaticNavigation,
  getPathFromState,
  NavigationState,
  StackActions,
  useNavigation,
} from "@react-navigation/native";
import {
  createNativeStackScreen,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { useEffect, useRef, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { useResolveClassNames } from "uniwind";
import { ComponentCatalogScreen } from "./features/development/ComponentCatalogScreen";
import { createWorkspaceStackNavigator } from "./features/layout/createWorkspaceStackNavigator";
import { PullRequestDiscussionScreen } from "./features/pull-requests/PullRequestDiscussionScreen";
import { PullRequestInlineCommentScreen } from "./features/pull-requests/PullRequestInlineCommentScreen";
import { PullRequestGuideStopScreen } from "./features/pull-requests/guide/PullRequestGuideScreen";
import { SettingsProjectGroupingRouteScreen } from "./features/settings/SettingsProjectGroupingRouteScreen";
import { isDraftThreadRoute } from "./features/threads/thread-route-state";

import { getCompactBrandHeaderOptions } from "./components/CompactBrandTitle";
import {
  RenderErrorBoundary,
  RenderFailureView,
  type RenderFailureProps,
} from "./components/RenderErrorBoundary";
import { AppText as Text } from "./components/ui/AppText";
import { useAgentNotificationNavigation } from "./features/agent-awareness/notificationNavigation";
import { ArchivedThreadsRouteScreen } from "./features/archive/ArchivedThreadsRouteScreen";
import { BrowserPreviewRouteScreen } from "./features/browser/BrowserPreviewRouteScreen";
import { ConnectOnboardingRouteScreen } from "./features/cloud/ConnectOnboardingRouteScreen";
import { useConnectOnboardingNavigation } from "./features/cloud/connectOnboardingNavigation";
import { ConnectionsNewRouteScreen } from "./features/connection/ConnectionsNewRouteScreen";
import { ConnectionsRouteScreen } from "./features/connection/ConnectionsRouteScreen";
import { DevicePreviewRouteScreen } from "./features/devices/DevicePreviewRouteScreen";
import { SettingsDiagnosticsRouteScreen } from "./features/diagnostics/SettingsDiagnosticsRouteScreen";
import { AttachmentFileScreen } from "./features/files/AttachmentFileScreen";
import { ThreadFileScreen, ThreadFilesTreeScreen } from "./features/files/ThreadFilesRouteScreen";
import { WorkspaceConnectionStatusProvider } from "./features/home/WorkspaceConnectionTitle";
import {
  HardwareKeyboardCommandOverlay,
  HardwareKeyboardCommandProvider,
} from "./features/keyboard/HardwareKeyboardCommandProvider";
import { AdaptiveWorkspaceLayout } from "./features/layout/AdaptiveWorkspaceLayout";
import {
  isWorkspaceOverlayRoute,
  registerPresentedRoutes,
} from "./features/layout/workspace-overlay-routes";
import { AddProjectDestinationRoute } from "./features/projects/AddProjectDestinationRoute";
import { AddProjectLocalRoute } from "./features/projects/AddProjectLocalRoute";
import { AddProjectNewRoute } from "./features/projects/AddProjectNewRoute";
import { AddProjectRepositoryRoute } from "./features/projects/AddProjectRepositoryRoute";
import { AddProjectSourceRoute } from "./features/projects/AddProjectSourceRoute";
import { PullRequestEditScreen } from "./features/pull-requests/PullRequestEditScreen";
import { PullRequestFilesSheet } from "./features/pull-requests/PullRequestFiles";
import { PullRequestFilterSearchScreen } from "./features/pull-requests/PullRequestFilterSearchScreen";
import { PullRequestLabelsScreen } from "./features/pull-requests/PullRequestLabelsScreen";
import { PullRequestReviewSheet } from "./features/pull-requests/PullRequestReviewSheet";
import { PullRequestReviewersScreen } from "./features/pull-requests/PullRequestReviewersScreen";
import {
  PullRequestFileRouteScreen,
  PullRequestRouteScreen,
} from "./features/pull-requests/PullRequestRouteScreen";
import { selectedPullRequestKey } from "./features/pull-requests/pullRequestSelection";
import { ReviewCommentComposerSheet } from "./features/review/ReviewCommentComposerSheet";
import { ReviewSheet } from "./features/review/ReviewSheet";
import {
  ScheduledTaskBranchPickerRouteScreen,
  ScheduledTaskModelPickerRouteScreen,
} from "./features/settings/ScheduledTaskPickerScreens";
import { SettingsAboutRouteScreen } from "./features/settings/SettingsAboutRouteScreen";
import { SettingsAppearanceRouteScreen } from "./features/settings/SettingsAppearanceRouteScreen";
import { SettingsAuthRouteScreen } from "./features/settings/SettingsAuthRouteScreen";
import { SettingsClientStorageRouteScreen } from "./features/settings/SettingsClientStorageRouteScreen";
import { SettingsEnvironmentDetailRouteScreen } from "./features/settings/SettingsEnvironmentDetailRouteScreen";
import { SettingsEnvironmentsRouteScreen } from "./features/settings/SettingsEnvironmentsRouteScreen";
import { SettingsFollowUpRouteScreen } from "./features/settings/SettingsFollowUpRouteScreen";
import { SettingsKeyboardRouteScreen } from "./features/settings/SettingsKeyboardRouteScreen";
import { SettingsLegalRouteScreen } from "./features/settings/SettingsLegalRouteScreen";
import { SettingsMicrophoneRouteScreen } from "./features/settings/SettingsMicrophoneRouteScreen";
import { SettingsNavigationRouteScreen } from "./features/settings/SettingsNavigationRouteScreen";
import { SettingsNotificationsRouteScreen } from "./features/settings/SettingsNotificationsRouteScreen";
import {
  SettingsOpenSourceLicenseRouteScreen,
  SettingsOpenSourceLicensesRouteScreen,
} from "./features/settings/SettingsOpenSourceLicensesRouteScreen";
import { SettingsProjectOverviewRouteScreen } from "./features/settings/SettingsProjectOverviewRouteScreen";
import { SettingsProviderAccountsRouteScreen } from "./features/settings/SettingsProviderAccountsRouteScreen";
import { SettingsRouteScreen } from "./features/settings/SettingsRouteScreen";
import {
  SettingsScheduledTaskEditRouteScreen,
  SettingsScheduledTaskNewRouteScreen,
  SettingsScheduledTasksRouteScreen,
} from "./features/settings/SettingsScheduledTasksRouteScreen";
import {
  SettingsEnvironmentAgentBehaviorRouteScreen,
  SettingsEnvironmentMaintenanceRouteScreen,
  SettingsEnvironmentNewThreadsRouteScreen,
  SettingsEnvironmentSourceControlRouteScreen,
} from "./features/settings/SettingsServerControlsRouteScreen";
import { SettingsThreadsRouteScreen } from "./features/settings/SettingsThreadsRouteScreen";
import {
  SettingsLegalDocumentCloseHeaderButton,
  SettingsLegalDocumentExternalHeaderButton,
} from "./features/settings/components/SettingsLegalDocumentRouteScreen";
import { SettingsEnvironmentFilterProvider } from "./features/settings/settings-environment-filter";
import { openSettings, settingsOpenIn } from "./features/settings/settings-navigation";
import { useIncomingShare } from "./features/sharing/IncomingShareProvider";
import {
  EMPTY_INCOMING_SHARE_PRESENTATION_STATE,
  transitionIncomingSharePresentation,
} from "./features/sharing/incoming-share-presentation";
import { useAppShortcuts } from "./features/shortcuts/useAppShortcuts";
import { ShowcaseCaptureCoordinator } from "./features/showcase/ShowcaseCaptureCoordinator";
import { ThreadTerminalRouteScreen } from "./features/terminal/ThreadTerminalRouteScreen";
import { McpAppFullscreenScreen } from "./features/threads/McpAppFullscreenScreen";
import {
  NewTaskBranchPickerRouteScreen,
  NewTaskEnvironmentPickerRouteScreen,
} from "./features/threads/NewTaskContextPickerScreens";
import { NewTaskRouteScreen } from "./features/threads/NewTaskRouteScreen";
import { ThreadAgentsSheet } from "./features/threads/ThreadAgentsSheet";
import { ThreadBackgroundWorkSheet } from "./features/threads/ThreadBackgroundWorkSheet";
import { ThreadPullRequestsSheet } from "./features/threads/ThreadPullRequestsSheet";
import { ThreadQueueSheet } from "./features/threads/ThreadQueueControl";
import {
  FullscreenThreadRouteScreen,
  ThreadRouteScreen,
} from "./features/threads/ThreadRouteScreen";
import {
  ExistingThreadSettingsRouteScreen,
  NewTaskThreadSettingsRouteScreen,
} from "./features/threads/ThreadSettingsSheet";
import { GitBranchesSheet } from "./features/threads/git/GitBranchesSheet";
import { GitCommitSheet } from "./features/threads/git/GitCommitSheet";
import { GitConfirmSheet } from "./features/threads/git/GitConfirmSheet";
import { GitOverviewSheet } from "./features/threads/git/GitOverviewSheet";
import { NewTaskFlowProvider } from "./features/threads/new-task-flow-provider";
import { ElysiaUsageRouteScreen } from "./features/usage/ElysiaUsageRouteScreen";
import { UsageLimitAccountScreen } from "./features/usage/UsageLimitsPooled";
import { AndroidWorkspaceTabsProvider } from "./features/workspace/AndroidWorkspaceTabsProvider";
import { WorkspaceRootScreen } from "./features/workspace/WorkspaceRootScreen";
import {
  selectWorkspaceDetail,
  workspaceDetailRouter,
} from "./features/workspace/workspace-detail-selection";
import { DEFAULT_SETTINGS_PAGE } from "./features/workspace/workspace-tab-navigation";
import { androidWorkspaceDestinationAnimation } from "./lib/android-workspace-navigation";
import { deriveLayout } from "./lib/layout";
import { nativeHeaderScrollEdgeEffects } from "./native/StackHeader";
import { NATIVE_LIQUID_GLASS_SUPPORTED } from "./native/native-glass";
import { useNativeLayoutMetrics } from "./native/native-layout-metrics";
import { formSheetDetents, HORIZONTAL_FORM_SHEET_OPTIONS } from "./native/sheet-surface";
import { useComposerAttachmentUploadWorker } from "./state/composer-attachment-uploads";
import { useThreadOutboxDrain } from "./state/use-thread-outbox-drain";

const HEADER_SCROLL_EDGE_EFFECTS = nativeHeaderScrollEdgeEffects(Platform.OS, Platform.Version);

type AppScreenOptions = NativeStackNavigationOptions & {
  readonly unstable_navigationItemStyle?: "editor";
  readonly unstable_headerMinimizationBehavior?: "onScrollUp" | "never";
};

const GLASS_HEADER_OPTIONS: AppScreenOptions = {
  headerBackButtonDisplayMode: "minimal",
  headerBackTitle: "",
  headerLargeTitle: false,
  headerShadowVisible: false,
  headerShown: true,
  headerStyle: NATIVE_LIQUID_GLASS_SUPPORTED ? { backgroundColor: "transparent" } : undefined,
  headerTitleStyle: { fontSize: 18, fontWeight: "800" },
  headerTransparent: NATIVE_LIQUID_GLASS_SUPPORTED,
  scrollEdgeEffects: NATIVE_LIQUID_GLASS_SUPPORTED ? HEADER_SCROLL_EDGE_EFFECTS : undefined,
  unstable_navigationItemStyle: NATIVE_LIQUID_GLASS_SUPPORTED ? "editor" : undefined,
};

// Hiding Android's native header after mount can leave detail panes measured short.
// These screens render their own Material toolbar, so hide it from the first layout.
const DETAIL_HEADER_OPTIONS: AppScreenOptions = {
  ...GLASS_HEADER_OPTIONS,
  headerShown: Platform.OS !== "android",
};

// Like Messages on the Duo: reading back through history (scrolling up) minimizes the
// header, and reversing toward the latest message restores it. Other devices ignore it.
const THREAD_HEADER_OPTIONS: AppScreenOptions = {
  ...DETAIL_HEADER_OPTIONS,
  unstable_headerMinimizationBehavior: "onScrollUp",
};

// The Duo minimizes headers on scroll down by default. Home and the pull request lists
// stutter against it on hardware (not reproducible in the simulator), so they keep theirs.
const FIXED_DUO_HEADER: AppScreenOptions = { unstable_headerMinimizationBehavior: "never" };

const SOLID_HEADER_OPTIONS: AppScreenOptions = {
  headerBackButtonDisplayMode: "minimal",
  headerBackTitle: "",
  headerLargeTitle: false,
  headerShadowVisible: false,
  headerShown: true,
  headerTitleStyle: { fontSize: 18, fontWeight: "800" },
  headerTransparent: false,
  unstable_navigationItemStyle: Platform.OS === "ios" ? "editor" : undefined,
};

const SHEET_SOLID_HEADER_OPTIONS: AppScreenOptions = {
  ...SOLID_HEADER_OPTIONS,
  unstable_navigationItemStyle: undefined,
};

const SHEET_GLASS_HEADER_OPTIONS: AppScreenOptions = {
  ...GLASS_HEADER_OPTIONS,
  unstable_navigationItemStyle: undefined,
};

const LEGAL_DOCUMENT_HEADER_OPTIONS: AppScreenOptions = {
  ...SHEET_SOLID_HEADER_OPTIONS,
  headerBackVisible: false,
  headerLeft: SettingsLegalDocumentCloseHeaderButton,
  headerRight: () => <SettingsLegalDocumentExternalHeaderButton />,
  presentation: "fullScreenModal",
};

// Thread settings keep the Duo's vertical bar so cancel, search, filter and confirm sit in the
// rail. The picker stack spans the sheet so its header reaches the rail, and insets its content.
const THREAD_SETTINGS_SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [1],
  sheetGrabberVisible: true,
  nativeContentInsetHorizontally: false,
};

// Settings pages are root routes so they share the workspace's columns and header. The
// `Settings` route marks the Settings tab as open (see settings-navigation.ts).
const SETTINGS_PAGE_OPTIONS = SHEET_GLASS_HEADER_OPTIONS;

const SETTINGS_SCREENS = {
  Settings: createNativeStackScreen({
    screen: SettingsRouteScreen,
    linking: "settings",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Settings",
      ...(Platform.OS === "android" ? { animation: "none" as const } : {}),
      // Android draws its own app bar here. Hidden only from inside the screen, the native one
      // showed for the first frame of the Settings tab and pushed the page down.
      headerShown: Platform.OS !== "android",
      headerBackVisible: false,
    },
  }),
  SettingsEnvironments: createNativeStackScreen({
    screen: CONNECTIONS_ENABLED ? SettingsEnvironmentsRouteScreen : SettingsRouteScreen,
    linking: "settings/environments",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Environments",
    },
  }),
  SettingsEnvironmentDetail: createNativeStackScreen({
    screen: CONNECTIONS_ENABLED ? SettingsEnvironmentDetailRouteScreen : SettingsRouteScreen,
    linking: "settings/environments/:environmentId",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Environment" },
  }),
  SettingsEnvironmentNewThreads: createNativeStackScreen({
    screen: CONNECTIONS_ENABLED ? SettingsEnvironmentNewThreadsRouteScreen : SettingsRouteScreen,
    linking: "settings/new-threads",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "New threads" },
  }),
  SettingsEnvironmentSourceControl: createNativeStackScreen({
    screen: CONNECTIONS_ENABLED ? SettingsEnvironmentSourceControlRouteScreen : SettingsRouteScreen,
    linking: "settings/source-control",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Source control" },
  }),
  SettingsEnvironmentAgentBehavior: createNativeStackScreen({
    screen: CONNECTIONS_ENABLED ? SettingsEnvironmentAgentBehaviorRouteScreen : SettingsRouteScreen,
    linking: "settings/agent-behavior",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Agent behavior" },
  }),
  SettingsProviderAccounts: createNativeStackScreen({
    screen: SettingsProviderAccountsRouteScreen,
    linking: "settings/provider-accounts",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Provider accounts" },
  }),
  SettingsEnvironmentMaintenance: createNativeStackScreen({
    screen: CONNECTIONS_ENABLED ? SettingsEnvironmentMaintenanceRouteScreen : SettingsRouteScreen,
    linking: "settings/maintenance",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Maintenance" },
  }),
  SettingsNotifications: createNativeStackScreen({
    screen: SettingsNotificationsRouteScreen,
    linking: "settings/notifications",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Notifications" },
  }),
  SettingsThreads: createNativeStackScreen({
    screen: SettingsThreadsRouteScreen,
    linking: "settings/thread-preferences",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Thread behavior" },
  }),
  SettingsAbout: createNativeStackScreen({
    screen: SettingsAboutRouteScreen,
    linking: "settings/about",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "About Elysia" },
  }),
  SettingsEnvironmentNew: createNativeStackScreen({
    screen: ConnectionsNewRouteScreen,
    linking: "settings/environment-new",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Add Environment",
    },
  }),
  SettingsArchive: createNativeStackScreen({
    screen: ArchivedThreadsRouteScreen,
    linking: "settings/archive",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Archived Threads",
    },
  }),
  SettingsNavigation: createNativeStackScreen({
    screen: SettingsNavigationRouteScreen,
    linking: "settings/navigation-tabs",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Navigation tabs" },
  }),
  SettingsAppearance: createNativeStackScreen({
    screen: SettingsAppearanceRouteScreen,
    linking: "settings/appearance",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Appearance",
    },
  }),
  SettingsProjectGrouping: createNativeStackScreen({
    screen: SettingsProjectGroupingRouteScreen,
    linking: "settings/project-grouping",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Organization",
    },
  }),
  SettingsOrganization: createNativeStackScreen({
    screen: SettingsProjectGroupingRouteScreen,
    linking: "settings/organization",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Organization",
    },
  }),
  SettingsProjectOverview: createNativeStackScreen({
    screen: SettingsProjectOverviewRouteScreen,
    linking: "settings/project",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Project overview" },
  }),
  SettingsKeyboard: createNativeStackScreen({
    screen: SettingsKeyboardRouteScreen,
    linking: "settings/keyboard",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Keyboard",
    },
  }),
  SettingsMicrophone: createNativeStackScreen({
    screen: SettingsMicrophoneRouteScreen,
    linking: "settings/microphone",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Microphone",
    },
  }),
  SettingsFollowUp: createNativeStackScreen({
    screen: SettingsFollowUpRouteScreen,
    linking: "settings/follow-ups",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Follow-ups",
    },
  }),
  SettingsScheduledTasks: createNativeStackScreen({
    screen: SettingsScheduledTasksRouteScreen,
    linking: "settings/scheduled-tasks",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Scheduled Tasks",
      headerTitleStyle: { fontSize: 16, fontWeight: "800" },
    },
  }),
  SettingsScheduledTaskNew: createNativeStackScreen({
    screen: SettingsScheduledTaskNewRouteScreen,
    linking: "settings/scheduled-tasks/new",
    options: { ...SETTINGS_PAGE_OPTIONS, title: "New scheduled task" },
  }),
  SettingsScheduledTaskEdit: createNativeStackScreen({
    screen: SettingsScheduledTaskEditRouteScreen,
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Edit scheduled task" },
  }),
  SettingsScheduledTaskBranch: createNativeStackScreen({
    screen: ScheduledTaskBranchPickerRouteScreen,
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Base branch" },
  }),
  SettingsScheduledTaskModel: createNativeStackScreen({
    screen: ScheduledTaskModelPickerRouteScreen,
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      headerShown: false,
      ...(Platform.OS === "android"
        ? { presentation: "card" as const }
        : {
            ...THREAD_SETTINGS_SHEET_OPTIONS,
          }),
    },
  }),
  SettingsClientStorage: createNativeStackScreen({
    screen: SettingsClientStorageRouteScreen,
    linking: "settings/client-storage",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Client Storage",
    },
  }),
  SettingsDiagnostics: createNativeStackScreen({
    screen: SettingsDiagnosticsRouteScreen,
    linking: "settings/diagnostics",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Diagnostics",
    },
  }),
  // These params snapshot the tap time, local filters, and freshly aggregated pools.
  // A linking path would round-trip them as URL query strings and preserve stale values.
  SettingsUsageAccount: createNativeStackScreen({
    screen: UsageLimitAccountScreen,
    options: { ...SETTINGS_PAGE_OPTIONS, title: "Account" },
  }),
  SettingsOpenSourceLicenses: createNativeStackScreen({
    screen: SettingsOpenSourceLicensesRouteScreen,
    linking: "settings/open-source-licenses",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Open source licenses",
    },
  }),
  SettingsOpenSourceLicense: createNativeStackScreen({
    screen: SettingsOpenSourceLicenseRouteScreen,
    linking: "settings/open-source-licenses/:entryKey",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "License notice",
    },
  }),
  SettingsUsage: createNativeStackScreen({
    screen: ElysiaUsageRouteScreen,
    linking: "settings/usage",
    options: {
      ...SETTINGS_PAGE_OPTIONS,
      title: "Usage",
    },
  }),
  SettingsAuth: createNativeStackScreen({
    screen: CONNECTIONS_ENABLED ? SettingsAuthRouteScreen : SettingsRouteScreen,
    linking: "settings/auth",
    options: { headerShown: false, presentation: "modal" },
  }),
  SettingsWaitlist: createNativeStackScreen({
    screen: CONNECTIONS_ENABLED ? SettingsAuthRouteScreen : SettingsRouteScreen,
    linking: "settings/waitlist",
    options: { headerShown: false, presentation: "modal" },
  }),
};

// iOS 26 header morphing requires one UINavigationBar; nested stacks make the whole screen slide.
const THREAD_LINKING_PREFIX = "threads/:environmentId/:threadId";

function workspaceLocationFromState(state: NavigationState) {
  const routes = state.routes.filter((route) => !isWorkspaceOverlayRoute(route.name));
  const effectiveState =
    routes.length > 0 && routes.length !== state.routes.length
      ? ({ ...state, routes, index: routes.length - 1 } as NavigationState)
      : state;
  const path = getPathFromState(effectiveState, navigationPathConfig);
  return {
    pathname: path.startsWith("/") ? path : `/${path}`,
    routeKey: effectiveState.routes[effectiveState.index]?.key,
  };
}

// Isolate subscriptions so streaming updates cannot re-render RootStackLayout and every screen.
function ThreadOutboxDrainWorker() {
  useThreadOutboxDrain();
  useComposerAttachmentUploadWorker();
  return null;
}

function RootStackLayout(props: {
  readonly children: React.ReactNode;
  readonly state: NavigationState;
}) {
  const navigation = useNavigation();
  const { pendingShare } = useIncomingShare();
  const sharePresentationRef = useRef(EMPTY_INCOMING_SHARE_PRESENTATION_STATE);
  const path = getPathFromState(props.state, navigationPathConfig);
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const workspaceLocation = workspaceLocationFromState(props.state);
  const settingsOpen = settingsOpenIn(
    props.state.routes
      .slice(0, props.state.index + 1)
      .filter((route) => !isWorkspaceOverlayRoute(route.name)),
  );
  const draftRoute = props.state.routes.findLast((route) => route.name === "Thread");
  const draftParams = (
    draftRoute?.params as
      | { draft?: { draftId?: string | string[]; pendingTaskId?: string | string[] } }
      | undefined
  )?.draft;
  const routeDraftId = Array.isArray(draftParams?.draftId)
    ? draftParams.draftId[0]
    : draftParams?.draftId;
  const routePendingTaskId = Array.isArray(draftParams?.pendingTaskId)
    ? draftParams.pendingTaskId[0]
    : draftParams?.pendingTaskId;
  useAgentNotificationNavigation(workspaceLocation.pathname);
  useConnectOnboardingNavigation();
  useAppShortcuts(props.state);
  useEffect(() => {
    const transition = transitionIncomingSharePresentation(sharePresentationRef.current, {
      isShareSheetPresented: isDraftThreadRoute(props.state.routes[props.state.index]),
      pendingShareId: pendingShare?.id ?? null,
    });
    sharePresentationRef.current = transition.state;
    if (!transition.shareIdToPresent) {
      return;
    }
    navigation.dispatch(
      selectWorkspaceDetail({
        name: "Thread",
        params: { draft: { incomingShareId: transition.shareIdToPresent } },
      }),
    );
  }, [navigation, pendingShare, props.state]);

  return (
    <NewTaskFlowProvider
      active={isDraftThreadRoute(draftRoute)}
      routeDraftId={routeDraftId}
      routePendingTaskId={routePendingTaskId}
    >
      <HardwareKeyboardCommandProvider pathname={pathname}>
        <ThreadOutboxDrainWorker />
        <ShowcaseCaptureCoordinator pathname={pathname} />
        <SettingsEnvironmentFilterProvider open={settingsOpen}>
          <WorkspaceConnectionStatusProvider>
            <AndroidWorkspaceTabsProvider state={props.state}>
              <AdaptiveWorkspaceLayout
                pathname={workspaceLocation.pathname}
                workspaceRouteKey={workspaceLocation.routeKey}
                selectedPullRequestKey={selectedPullRequestKey(props.state)}
              >
                {props.children}
                <HardwareKeyboardCommandOverlay />
              </AdaptiveWorkspaceLayout>
            </AndroidWorkspaceTabsProvider>
          </WorkspaceConnectionStatusProvider>
        </SettingsEnvironmentFilterProvider>
      </HardwareKeyboardCommandProvider>
    </NewTaskFlowProvider>
  );
}

function NotFoundScreen() {
  const navigation = useNavigation();
  const screenBgStyle = StyleSheet.flatten(useResolveClassNames("bg-screen"));
  const primaryBgStyle = StyleSheet.flatten(useResolveClassNames("bg-primary"));
  const returnHomeButtonStyle = StyleSheet.flatten([
    {
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    primaryBgStyle,
  ]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
      style={[{ flex: 1 }, screenBgStyle]}
    >
      <Text className="text-3xl font-t3-bold text-foreground" selectable>
        Route not found
      </Text>
      <Pressable
        style={returnHomeButtonStyle}
        onPress={() => navigation.dispatch(StackActions.replace("Home"))}
      >
        <Text className="text-base font-t3-bold text-primary-foreground">Return home</Text>
      </Pressable>
    </ScrollView>
  );
}

const RootStackConfig = createWorkspaceStackNavigator({
  initialRouteName: "Home",
  UNSTABLE_router: workspaceDetailRouter,
  // React Navigation calls layouts inline; compiled components would share the navigator's memo cache.
  layout: (props) => <RootStackLayout {...props} />,
  screenOptions: {
    headerShown: false,
  },
  screens: {
    ...(__DEV__
      ? {
          ComponentCatalog: createNativeStackScreen({
            screen: ComponentCatalogScreen,
            linking: "dev/components",
            options: { title: "UI components" },
          }),
        }
      : {}),
    Home: createNativeStackScreen({
      screen: WorkspaceRootScreen,
      linking: "",
      options: {
        ...GLASS_HEADER_OPTIONS,
        ...FIXED_DUO_HEADER,
        contentStyle: { backgroundColor: "transparent" },
        headerBackVisible: false,
        ...getCompactBrandHeaderOptions(),
      },
    }),
    PullRequest: createNativeStackScreen({
      screen: PullRequestRouteScreen,
      linking: {
        path: "pull-requests/:environmentId/:projectId/:repository/:number",
        parse: { number: Number },
      },
      options: { ...DETAIL_HEADER_OPTIONS, ...FIXED_DUO_HEADER },
    }),
    PullRequestGuideStop: createNativeStackScreen({
      screen: PullRequestGuideStopScreen,
      options: DETAIL_HEADER_OPTIONS,
    }),
    PullRequestFile: createNativeStackScreen({
      screen: PullRequestFileRouteScreen,
      options: DETAIL_HEADER_OPTIONS,
    }),
    PullRequestFiles: createNativeStackScreen({
      screen: PullRequestFilesSheet,
      options: {
        ...(Platform.OS === "ios" ? SHEET_GLASS_HEADER_OPTIONS : undefined),
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.6),
        sheetGrabberVisible: true,
        sheetCornerRadius: Platform.OS === "android" ? 28 : undefined,
      },
    }),
    PullRequestReviewers: createNativeStackScreen({
      screen: PullRequestReviewersScreen,
      options: {
        ...DETAIL_HEADER_OPTIONS,
        ...FIXED_DUO_HEADER,
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.75),
        sheetGrabberVisible: true,
        headerBackVisible: false,
      },
    }),
    PullRequestLabels: createNativeStackScreen({
      screen: PullRequestLabelsScreen,
      // Presented like PullRequestFilterSearch, whose search sheet it shares.
      options:
        Platform.OS === "android"
          ? { presentation: "card", headerShown: false }
          : {
              ...DETAIL_HEADER_OPTIONS,
              ...HORIZONTAL_FORM_SHEET_OPTIONS,
              sheetAllowedDetents: formSheetDetents(0.75),
              sheetGrabberVisible: true,
              headerBackVisible: false,
            },
    }),
    PullRequestFilterSearch: createNativeStackScreen({
      screen: PullRequestFilterSearchScreen,
      // Android pushes it like the branch picker; a formSheet there leaves the list's header
      // peeking above it once the keyboard opens.
      options:
        Platform.OS === "android"
          ? { presentation: "card", headerShown: false }
          : {
              ...DETAIL_HEADER_OPTIONS,
              ...HORIZONTAL_FORM_SHEET_OPTIONS,
              sheetAllowedDetents: formSheetDetents(0.75),
              sheetGrabberVisible: true,
              headerBackVisible: false,
            },
    }),
    PullRequestDiscussion: createNativeStackScreen({
      screen: PullRequestDiscussionScreen,
      options: DETAIL_HEADER_OPTIONS,
    }),
    PullRequestInlineComment: createNativeStackScreen({
      screen: PullRequestInlineCommentScreen,
      options: {
        ...(Platform.OS === "android"
          ? { presentation: "fullScreenModal" as const }
          : { ...SHEET_GLASS_HEADER_OPTIONS, ...HORIZONTAL_FORM_SHEET_OPTIONS }),
        sheetAllowedDetents: Platform.OS === "android" ? undefined : formSheetDetents(0.75),
        sheetGrabberVisible: Platform.OS !== "android",
      },
    }),
    PullRequestReview: createNativeStackScreen({
      screen: PullRequestReviewSheet,
      options: {
        ...(Platform.OS === "ios" ? SHEET_GLASS_HEADER_OPTIONS : undefined),
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.75),
        sheetGrabberVisible: true,
      },
    }),
    PullRequestEdit: createNativeStackScreen({
      screen: PullRequestEditScreen,
      options: {
        ...(Platform.OS === "ios" ? SHEET_GLASS_HEADER_OPTIONS : undefined),
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.75),
        sheetGrabberVisible: true,
      },
    }),
    Thread: createNativeStackScreen({
      screen: ThreadRouteScreen,
      linking: { path: "threads/:environmentId?/:threadId?", alias: ["new/draft"] },
      options: THREAD_HEADER_OPTIONS,
    }),
    NewTaskProject: createNativeStackScreen({
      screen: NewTaskRouteScreen,
      linking: { path: "new", alias: ["new/project"] },
      options: { ...GLASS_HEADER_OPTIONS, title: "Choose project" },
    }),
    NewTaskEnvironment: createNativeStackScreen({
      linking: "new/draft/environment",
      screen: NewTaskEnvironmentPickerRouteScreen,
      options: { ...GLASS_HEADER_OPTIONS, title: "Environment" },
    }),
    NewTaskBranch: createNativeStackScreen({
      linking: "new/draft/branch",
      screen: NewTaskBranchPickerRouteScreen,
      options: { ...GLASS_HEADER_OPTIONS, title: "Branch" },
    }),
    AddProject: createNativeStackScreen({
      linking: "new/add-project",
      screen: AddProjectSourceRoute,

      options: {
        ...GLASS_HEADER_OPTIONS,
        title: "Add project",
      },
    }),
    AddProjectRepository: createNativeStackScreen({
      linking: "new/add-project/repository",
      screen: AddProjectRepositoryRoute,
      options: GLASS_HEADER_OPTIONS,
    }),
    AddProjectDestination: createNativeStackScreen({
      linking: "new/add-project/destination",
      screen: AddProjectDestinationRoute,
      options: GLASS_HEADER_OPTIONS,
    }),
    AddProjectLocal: createNativeStackScreen({
      linking: "new/add-project/local",
      screen: AddProjectLocalRoute,
      options: GLASS_HEADER_OPTIONS,
    }),
    AddProjectNew: createNativeStackScreen({
      linking: "new/add-project/new",
      screen: AddProjectNewRoute,
      options: GLASS_HEADER_OPTIONS,
    }),
    NewTaskFiles: createNativeStackScreen({
      linking: "new/draft/files",
      screen: ThreadFilesTreeScreen,
      options: SOLID_HEADER_OPTIONS,
    }),
    NewTaskFile: createNativeStackScreen({
      linking: "new/draft/files/:path*",
      screen: ThreadFileScreen,
      options: SOLID_HEADER_OPTIONS,
    }),
    NewTaskAttachment: createNativeStackScreen({
      screen: AttachmentFileScreen,
      linking: "new/draft/attachments/:attachmentId",
      options: SOLID_HEADER_OPTIONS,
    }),
    NewTaskThreadSettings: createNativeStackScreen({
      screen: NewTaskThreadSettingsRouteScreen,
      linking: "new/draft/settings",
      options: {
        gestureEnabled: true,
        headerShown: false,
        ...(Platform.OS === "android"
          ? { presentation: "card" as const }
          : THREAD_SETTINGS_SHEET_OPTIONS),
      },
    }),
    ThreadTerminal: createNativeStackScreen({
      screen: ThreadTerminalRouteScreen,
      linking: `${THREAD_LINKING_PREFIX}/terminal`,
      options: SOLID_HEADER_OPTIONS,
    }),
    ThreadInspectorFullscreen: createNativeStackScreen({
      screen: FullscreenThreadRouteScreen,
      options: {
        ...THREAD_HEADER_OPTIONS,
        presentation: "fullScreenModal",
      },
    }),
    ThreadDevicePreview: createNativeStackScreen({
      screen: DevicePreviewRouteScreen,
      linking: `${THREAD_LINKING_PREFIX}/devices`,
      options: {
        presentation: "fullScreenModal",
        headerShown: false,
        gestureEnabled: false,
        autoHideHomeIndicator: true,
        navigationBarHidden: true,
      },
    }),
    ThreadBrowserPreview: createNativeStackScreen({
      screen: BrowserPreviewRouteScreen,
      linking: `${THREAD_LINKING_PREFIX}/browser`,
      options: {
        presentation: "fullScreenModal",
        headerShown: false,
        gestureEnabled: false,
      },
    }),
    ThreadReview: createNativeStackScreen({
      screen: ReviewSheet,
      linking: `${THREAD_LINKING_PREFIX}/review`,
      options: GLASS_HEADER_OPTIONS,
    }),
    ThreadReviewComment: createNativeStackScreen({
      screen: ReviewCommentComposerSheet,
      linking: `${THREAD_LINKING_PREFIX}/review-comment`,
      options: {
        // Android formSheets cannot host the keyboard-driven comment composer.
        ...(Platform.OS === "android"
          ? { presentation: "fullScreenModal" as const }
          : HORIZONTAL_FORM_SHEET_OPTIONS),
        sheetAllowedDetents: Platform.OS === "android" ? undefined : formSheetDetents(0.55),
        sheetGrabberVisible: Platform.OS !== "android",
      },
    }),
    ThreadFiles: createNativeStackScreen({
      screen: ThreadFilesTreeScreen,
      linking: `${THREAD_LINKING_PREFIX}/files`,
      options: {
        ...GLASS_HEADER_OPTIONS,
        title: "Files",
      },
    }),
    ThreadFile: createNativeStackScreen({
      screen: ThreadFileScreen,
      linking: `${THREAD_LINKING_PREFIX}/files/:path*`,
      options: GLASS_HEADER_OPTIONS,
    }),
    ThreadMcpApp: createNativeStackScreen({
      screen: McpAppFullscreenScreen,
      linking: `${THREAD_LINKING_PREFIX}/apps/:itemId`,
      options: {
        presentation: "fullScreenModal",
        headerShown: false,
        gestureEnabled: false,
      },
    }),
    ThreadAttachment: createNativeStackScreen({
      screen: AttachmentFileScreen,
      linking: `${THREAD_LINKING_PREFIX}/attachments/:attachmentId`,
      options: SOLID_HEADER_OPTIONS,
    }),
    ThreadSettingsSheet: createNativeStackScreen({
      screen: ExistingThreadSettingsRouteScreen,
      options: {
        gestureEnabled: true,
        headerShown: false,
        ...(Platform.OS === "android"
          ? { presentation: "card" as const }
          : {
              ...THREAD_SETTINGS_SHEET_OPTIONS,
            }),
      },
    }),
    ThreadQueue: createNativeStackScreen({
      screen: ThreadQueueSheet,
      options: {
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        headerShown: false,
        sheetAllowedDetents: formSheetDetents(0.65, 0.95),
        sheetGrabberVisible: true,
      },
    }),
    ThreadBackgroundWork: createNativeStackScreen({
      screen: ThreadBackgroundWorkSheet,
      options: {
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        headerShown: false,
        sheetAllowedDetents: formSheetDetents(0.5, 0.9),
        sheetGrabberVisible: true,
      },
    }),
    ThreadAgents: createNativeStackScreen({
      screen: ThreadAgentsSheet,
      options: {
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        headerShown: false,
        sheetAllowedDetents: formSheetDetents(0.5, 0.9),
        sheetGrabberVisible: true,
      },
    }),
    GitOverview: createNativeStackScreen({
      screen: GitOverviewSheet,
      linking: `${THREAD_LINKING_PREFIX}/git`,
      options: {
        ...(Platform.OS === "ios" ? SHEET_GLASS_HEADER_OPTIONS : undefined),
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.55),
        sheetGrabberVisible: true,
      },
    }),
    ThreadPullRequests: createNativeStackScreen({
      screen: ThreadPullRequestsSheet,
      linking: `${THREAD_LINKING_PREFIX}/pull-requests`,
      options: {
        ...(Platform.OS === "ios" ? SHEET_GLASS_HEADER_OPTIONS : undefined),
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.55),
        sheetGrabberVisible: true,
      },
    }),
    GitCommit: createNativeStackScreen({
      screen: GitCommitSheet,
      linking: `${THREAD_LINKING_PREFIX}/git/commit`,
      options: {
        ...(Platform.OS === "ios" ? SHEET_GLASS_HEADER_OPTIONS : undefined),
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.8),
        sheetGrabberVisible: true,
      },
    }),
    GitBranches: createNativeStackScreen({
      screen: GitBranchesSheet,
      linking: `${THREAD_LINKING_PREFIX}/git/branches`,
      options: {
        ...(Platform.OS === "ios" ? SHEET_GLASS_HEADER_OPTIONS : undefined),
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.55),
        sheetGrabberVisible: true,
      },
    }),
    GitConfirm: createNativeStackScreen({
      screen: GitConfirmSheet,
      linking: `${THREAD_LINKING_PREFIX}/git-confirm`,
      options: {
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: [0.55, 0.7],
        sheetGrabberVisible: true,
      },
    }),
    ...SETTINGS_SCREENS,
    SettingsLegal: createNativeStackScreen({
      screen:
        UPSTREAM_ANALYTICS_ENABLED && process.env.EXPO_PUBLIC_MARKETING_SITE_URL
          ? SettingsLegalRouteScreen
          : SettingsAboutRouteScreen,
      linking: "settings/legal",
      options: {
        ...(UPSTREAM_ANALYTICS_ENABLED && process.env.EXPO_PUBLIC_MARKETING_SITE_URL
          ? LEGAL_DOCUMENT_HEADER_OPTIONS
          : SHEET_SOLID_HEADER_OPTIONS),
        title: UPSTREAM_ANALYTICS_ENABLED ? "Legal" : "About Elysia",
      },
    }),
    ConnectOnboarding: createNativeStackScreen({
      screen: CONNECTIONS_ENABLED ? ConnectOnboardingRouteScreen : SettingsRouteScreen,
      linking: "connect-onboarding",
      options: {
        // Android root formSheets lack a native stack bar; the route provides AndroidSheetHeader.
        ...(Platform.OS === "android" ? { headerShown: false } : SHEET_SOLID_HEADER_OPTIONS),
        title: "Set up Connections",
        gestureEnabled: true,
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: formSheetDetents(0.6, 0.95),
        sheetGrabberVisible: true,
      },
    }),
    Connections: createNativeStackScreen({
      screen: CONNECTIONS_ENABLED ? ConnectionsRouteScreen : SettingsRouteScreen,
      linking: "connections",
      options: {
        title: "Environments",
        ...(Platform.OS === "android"
          ? { presentation: "card" as const, headerShown: false }
          : {
              ...HORIZONTAL_FORM_SHEET_OPTIONS,
              sheetAllowedDetents: [0.55, 0.7],
              sheetGrabberVisible: true,
            }),
      },
    }),
    ConnectionsNew: createNativeStackScreen({
      screen: CONNECTIONS_ENABLED ? ConnectionsNewRouteScreen : SettingsRouteScreen,
      linking: "connections/new",
      options: {
        // Mount the iOS header immediately to avoid remounting the pairing form.
        ...(Platform.OS === "ios" ? SHEET_GLASS_HEADER_OPTIONS : undefined),
        title: "Add Environment",
        ...HORIZONTAL_FORM_SHEET_OPTIONS,
        sheetAllowedDetents: [0.55, 0.7],
        sheetGrabberVisible: true,
      },
    }),
    NotFound: createNativeStackScreen({
      screen: NotFoundScreen,
      linking: "*",
    }),
  },
});

function GuardedScreenLayout(props: {
  readonly children: ReactNode;
  readonly route: { readonly name: string; readonly params?: object | undefined };
}) {
  return (
    <RenderErrorBoundary
      resetKeys={[props.route.params]}
      renderFallback={(fallback) => (
        <ScreenRenderFallback {...fallback} routeName={props.route.name} />
      )}
    >
      {props.children}
    </RenderErrorBoundary>
  );
}

function ScreenRenderFallback(props: RenderFailureProps & { readonly routeName: string }) {
  const navigation = useNavigation();
  const exit = navigation.canGoBack()
    ? { label: "Go back", onPress: () => navigation.goBack() }
    : props.routeName === "Home"
      ? // Home itself failed, and the Settings list renders inside it; open a Settings page.
        {
          label: "Open settings",
          onPress: () => openSettings(navigation, DEFAULT_SETTINGS_PAGE),
        }
      : { label: "Return home", onPress: () => navigation.dispatch(StackActions.replace("Home")) };

  return <RenderFailureView {...props} exit={exit} />;
}

registerPresentedRoutes(
  Object.entries(RootStackConfig.config.screens ?? {}).flatMap(([name, screen]) => {
    const options = (screen as { readonly options?: unknown }).options;
    const presentation =
      options && typeof options === "object"
        ? (options as { readonly presentation?: string }).presentation
        : undefined;
    return presentation !== undefined && presentation !== "card" ? [name] : [];
  }),
);

export const RootStack = RootStackConfig.with(function AdaptiveRootStack({ Navigator }) {
  const { width, height } = useWindowDimensions();
  const nativeMetrics = useNativeLayoutMetrics();
  const usesSplitView = deriveLayout({ width, height, nativeMetrics }).usesSplitView;

  /* oxlint-disable react/no-unstable-nested-components -- React Navigation invokes screenLayout as a render callback. */
  return (
    <Navigator
      screenLayout={(props) => <GuardedScreenLayout {...props} />}
      screenOptions={({ route }) =>
        Platform.OS === "android"
          ? { animation: androidWorkspaceDestinationAnimation(route.name, usesSplitView) }
          : {}
      }
    />
  );

  /* oxlint-enable react/no-unstable-nested-components */
});

type RootStackType = typeof RootStack;

const navigationPathConfig = {
  screens: createPathConfigForStaticNavigation(RootStack) ?? {},
};

declare module "@react-navigation/native" {
  interface RootNavigator extends RootStackType {}
}
