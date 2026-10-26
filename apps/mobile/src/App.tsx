import { CONNECTIONS_ENABLED, SINGLE_PROVIDER_UI } from "@elysiatools/contracts";
import {
  createNavigationContainerRef,
  createStaticNavigation,
  getActionFromState,
  getStateFromPath,
} from "@react-navigation/native";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { installPermissionUpdateNotice } from "./features/connection/permissionUpdateNotice";

import { RegistryContext } from "@effect/atom-react";
import * as Dialog from "./components/ui/Dialog";
import { OverlayPortalHost } from "./components/ui/OverlayPortal";
import { CloudAuthProvider } from "./features/cloud/CloudAuthProvider";
import { hasCloudPublicConfig } from "./features/cloud/publicConfig";
import {
  AppearancePreferencesProvider,
  useAppearancePreferences,
} from "./features/settings/appearance/AppearancePreferencesProvider";
import { takeScheduledTaskNewLink } from "./features/settings/scheduled-task-editor-state";
import { restoreSettingsLinkState } from "./features/settings/settings-navigation";
import { IncomingShareProvider } from "./features/sharing/IncomingShareProvider";
import { prepareNativeShowcaseCapture } from "./features/showcase/nativeShowcaseScene";
import { ThreadArrangementHost } from "./features/threads/ThreadArrangementSheet";
import { GlobalVoiceInputControl } from "./features/voice-input/GlobalVoiceInputControl";
import { VoiceInputProvider } from "./features/voice-input/VoiceInputProvider";
import { workspaceDetailLinkAction } from "./features/workspace/workspace-detail-selection";
import {
  hydrateWorkspaceSelections,
  launchWorkspaceURL,
  recordWorkspaceSelections,
  settingsLinkPage,
} from "./features/workspace/workspace-selection-store";
import { restoreDraftLinkState, shouldHandleAppLink } from "./lib/appLinking";
import {
  disposeOnFoundationReplace,
  type FoundationHotModule,
} from "./lib/foundation-fast-refresh";
import { useMobileNavigationTheme } from "./lib/useMobileNavigationTheme";
import { useUiRuntimeMemoryWarningGc } from "./lib/useUiRuntimeMemoryWarningGc";
import { NativeLayoutMetricsProvider } from "./native/native-layout-metrics";
import { ProjectChipIconRasterizer } from "./native/ProjectChipIconImages";
import { RootStack } from "./Stack";
import { appAtomRegistry } from "./state/atom-registry";
import { environmentShell } from "./state/shell";
import { environmentThreadShells } from "./state/threads";
import { subscribeComposerDraftModelReconciliation } from "./state/use-composer-drafts";
import { SubscriptionUsageCoordinator } from "./widgets/SubscriptionUsageCoordinator";

import "../global.css";

if (process.env.EXPO_PUBLIC_SHOWCASE === "1") {
  prepareNativeShowcaseCapture();
}

void SplashScreen.preventAutoHideAsync().catch(() => {});
void hydrateWorkspaceSelections();

const appLinking = {
  prefixes: [Linking.createURL("/"), "t3code://", "t3code-dev://", "t3code-preview://"],
  config: { initialRouteName: "Home" },
  filter: (url: string) => shouldHandleAppLink(url, hasCloudPublicConfig()),
  getInitialURL: async () => (await Linking.getInitialURL()) ?? (await launchWorkspaceURL()),
  getActionFromState: (
    state: Parameters<typeof getActionFromState>[0],
    options: Parameters<typeof getActionFromState>[1],
  ): ReturnType<typeof getActionFromState> =>
    // Our router handles the selection; React Navigation's type only lists its own actions.
    (workspaceDetailLinkAction(state) as ReturnType<typeof getActionFromState>) ??
    getActionFromState(state, options),
  getStateFromPath: (path: string, options: Parameters<typeof getStateFromPath>[1]) =>
    takeScheduledTaskNewLink(
      restoreSettingsLinkState(
        restoreDraftLinkState(getStateFromPath(path, options), path),
        settingsLinkPage(),
      ),
    ),
};

const Navigation = createStaticNavigation(RootStack);
const navigationRef = createNavigationContainerRef();

declare const module: { readonly hot?: FoundationHotModule } | undefined;

const disposePermissionUpdateNotice = CONNECTIONS_ENABLED
  ? installPermissionUpdateNotice()
  : () => {};
disposeOnFoundationReplace(
  typeof module === "undefined" ? undefined : module.hot,
  disposePermissionUpdateNotice,
);

function SplashScreenCoordinator() {
  const { isReady } = useAppearancePreferences();

  useEffect(() => {
    if (isReady) void SplashScreen.hide();
  }, [isReady]);

  return null;
}

export default function App() {
  useUiRuntimeMemoryWarningGc();
  useEffect(
    () =>
      subscribeComposerDraftModelReconciliation({
        registry: appAtomRegistry,
        threadShellAtom: environmentThreadShells.threadShellAtom,
        threadRefsAtom: environmentThreadShells.threadRefsAtom,
        shellStateAtom: environmentShell.stateAtom,
      }),
    [],
  );

  return (
    <RegistryContext.Provider value={appAtomRegistry}>
      <CloudAuthProvider>
        <AppearancePreferencesProvider>
          <AppContent />
        </AppearancePreferencesProvider>
      </CloudAuthProvider>
    </RegistryContext.Provider>
  );
}

function AppContent() {
  const { themeAppearance } = useAppearancePreferences();
  const navigationTheme = useMobileNavigationTheme();

  return (
    <>
      <SplashScreenCoordinator />
      {!SINGLE_PROVIDER_UI ? <SubscriptionUsageCoordinator /> : null}
      <GestureHandlerRootView className="flex-1">
        <KeyboardProvider statusBarTranslucent>
          <SafeAreaProvider>
            <VoiceInputProvider>
              <StatusBar barStyle={themeAppearance === "dark" ? "light-content" : "dark-content"} />
              {/* native-stack needs the theme's dark flag to select dark native headers. */}
              <GlobalVoiceInputControl>
                <NativeLayoutMetricsProvider>
                  <IncomingShareProvider>
                    <Navigation
                      ref={navigationRef}
                      linking={appLinking}
                      onReady={() => recordWorkspaceSelections(navigationRef.getRootState())}
                      theme={navigationTheme}
                      onStateChange={recordWorkspaceSelections}
                    />
                  </IncomingShareProvider>
                  <Dialog.Host />
                  <ThreadArrangementHost />
                  <ProjectChipIconRasterizer />
                </NativeLayoutMetricsProvider>
              </GlobalVoiceInputControl>
              <OverlayPortalHost />
            </VoiceInputProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </>
  );
}
