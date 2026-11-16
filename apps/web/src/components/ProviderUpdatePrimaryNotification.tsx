import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, type ReactNode } from "react";
import { AuthProvidersManageScope, type EnvironmentId } from "@elysiatools/contracts";

import { useStableCallback } from "../hooks/useStableCallback";
import { primaryServerProvidersAtom, serverEnvironment } from "../state/server";
import { usePrimaryEnvironment } from "../state/environments";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import {
  providerUpdateCheckAtom,
  useDismissedProviderUpdateNotificationKeys,
} from "../providerUpdateDismissal";
import { ProviderUpdateToastIcon } from "./ProviderUpdateToastIcon";
import {
  canOfferProviderUpdate,
  canOneClickUpdateProviderCandidate,
  collectProviderUpdateCandidates,
  getProviderUpdateCompletionToastView,
  getProviderUpdateInitialToastView,
  getProviderUpdateProgressToastView,
  matchesProviderUpdateCheck,
  providerUpdateNotificationKey,
  type ProviderUpdateCandidate,
  type ProviderUpdateToastView,
} from "./ProviderUpdateLaunchNotification.logic";
import { hiddenToastActionProps, stackedThreadToast, toastManager } from "./ui/toast";
import { useAtomCommand } from "../state/use-atom-command";

const seenProviderUpdateNotificationKeys = new Set<string>();
type ProviderUpdateToastId = ReturnType<typeof toastManager.add>;

type ActiveProviderUpdateToast =
  | {
      readonly kind: "prompt";
      readonly key: string;
      readonly toastId: ProviderUpdateToastId;
      readonly canManageProviders: boolean;
    }
  | {
      readonly kind: "update";
      readonly toastId: ProviderUpdateToastId;
    };

function buildUpdatePrompt(input: {
  readonly view: ProviderUpdateToastView;
  readonly providers: ReadonlyArray<ProviderUpdateCandidate>;
  readonly canUpdate: boolean;
  readonly canManageProviders: boolean;
  readonly openSettings: () => void;
  readonly update: () => void;
  readonly dismiss: () => void;
}) {
  const settingsAction = { children: "Settings", onClick: input.openSettings };
  return stackedThreadToast({
    type: input.view.type,
    title: input.view.title,
    description: input.canManageProviders
      ? input.view.description
      : "This connection cannot manage provider accounts. View provider settings for update details.",
    timeout: 0,
    actionProps: input.canUpdate
      ? { children: "Update", disabled: !input.canManageProviders, onClick: input.update }
      : settingsAction,
    actionVariant: "outline",
    data: {
      position: "bottom-right",
      leadingIcon: <ProviderUpdateToastIcon providers={input.providers} />,
      hideCopyButton: true,
      onClose: input.dismiss,
      ...(input.canUpdate
        ? { secondaryActionProps: settingsAction, secondaryActionVariant: "outline" as const }
        : {}),
    },
  });
}

function addProviderUpdateToast(input: {
  readonly view: ProviderUpdateToastView;
  readonly openSettings: (toastId: ProviderUpdateToastId) => void;
  readonly leadingIcon?: ReactNode;
}) {
  if (input.view.type === "loading" || input.view.type === "success") {
    return toastManager.add({
      type: input.view.type,
      title: input.view.title,
      description: input.view.description,
      timeout: 0,
      actionProps: hiddenToastActionProps,
      data: {
        position: "bottom-right",
        hideCopyButton: true,
        leadingIcon: input.leadingIcon,
        ...(input.view.dismissAfterVisibleMs !== undefined
          ? { dismissAfterVisibleMs: input.view.dismissAfterVisibleMs }
          : {}),
      },
    });
  }

  let toastId!: ProviderUpdateToastId;
  toastId = toastManager.add(
    stackedThreadToast({
      type: input.view.type,
      title: input.view.title,
      description: input.view.description,
      timeout: 0,
      actionProps: {
        children: "Settings",
        onClick: () => input.openSettings(toastId),
      },
      actionVariant: "outline",
      data: {
        position: "bottom-right",
        hideCopyButton: true,
        leadingIcon: input.leadingIcon,
      },
    }),
  );
  return toastId;
}

export function ProviderUpdatePrimaryNotification() {
  const navigate = useNavigate();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const primaryEnvironment = usePrimaryEnvironment();
  const canManageProviders = useEnvironmentScope(
    primaryEnvironment?.environmentId ?? null,
    AuthProvidersManageScope,
  );
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, {
    reportFailure: false,
  });
  const activeToastRef = useRef<ActiveProviderUpdateToast | null>(null);
  const manualCheck = useAtomValue(providerUpdateCheckAtom);
  const handledCheck = useRef<typeof manualCheck>(null);
  const { dismissedNotificationKeys, dismissNotificationKey } =
    useDismissedProviderUpdateNotificationKeys();

  // oxlint-disable-next-line elysia/no-unreasoned-state-sync -- Dispose the imperative toast-manager prompt when its React owner unmounts.
  useEffect(() => {
    return () => {
      const activeToast = activeToastRef.current;
      if (activeToast) {
        toastManager.close(activeToast.toastId);
      }
      activeToastRef.current = null;
    };
  }, []);

  const updateProviders = collectProviderUpdateCandidates(providers);
  const notificationKey = providerUpdateNotificationKey(updateProviders);
  const oneClickProviders = updateProviders.filter((provider) =>
    canOneClickUpdateProviderCandidate(provider, providers),
  );

  const openProviderSettings = useStableCallback((toastId: ProviderUpdateToastId) => {
    toastManager.close(toastId);
    const activeToast = activeToastRef.current;
    if (activeToast?.kind === "prompt" && activeToast.toastId === toastId) {
      activeToastRef.current = null;
    }
    void navigate({ to: "/settings/providers" });
  });

  const runUpdates = useStableCallback(
    async (
      toastId: ProviderUpdateToastId,
      environmentId: EnvironmentId | undefined,
      candidates: ReadonlyArray<ProviderUpdateCandidate>,
    ) => {
      if (
        activeToastRef.current?.toastId !== toastId ||
        environmentId === undefined ||
        primaryEnvironment?.environmentId !== environmentId ||
        !readEnvironmentScope(environmentId, AuthProvidersManageScope)
      ) {
        return;
      }

      const providerCount = candidates.length;
      const leadingIcon = <ProviderUpdateToastIcon providers={candidates} />;
      toastManager.close(toastId);
      const activeUpdate: ActiveProviderUpdateToast = {
        kind: "update",
        toastId: addProviderUpdateToast({
          view: getProviderUpdateProgressToastView({ providers: [], providerCount }),
          openSettings: openProviderSettings,
          leadingIcon,
        }),
      };
      activeToastRef.current = activeUpdate;
      const finish = (view: ProviderUpdateToastView) => {
        if (activeToastRef.current !== activeUpdate) return;
        toastManager.close(activeUpdate.toastId);
        addProviderUpdateToast({ view, openSettings: openProviderSettings, leadingIcon });
        activeToastRef.current = null;
      };

      const results = [];
      for (const provider of candidates) {
        results.push({
          provider,
          result: await updateProvider({
            environmentId,
            input: {
              provider: provider.driver,
              instanceId: provider.instanceId,
              ...(provider.updateTarget && { updateTarget: provider.updateTarget }),
            },
          }),
        });
      }

      finish(getProviderUpdateCompletionToastView(results));
    },
  );

  // oxlint-disable-next-line elysia/no-unreasoned-state-sync -- Reconcile pushed update availability and current authorization with the imperative toast prompt.
  useEffect(() => {
    const activeToast = activeToastRef.current;
    if (activeToast?.kind === "update") return;
    const currentPrompt = activeToast?.key === notificationKey ? activeToast : null;
    if (activeToast && !currentPrompt) {
      toastManager.close(activeToast.toastId);
      activeToastRef.current = null;
    }
    if (!notificationKey) return;

    const checkedManually = matchesProviderUpdateCheck(
      manualCheck,
      handledCheck.current,
      primaryEnvironment?.environmentId,
      notificationKey,
    );
    if (checkedManually) handledCheck.current = manualCheck;
    const updateExistingPrompt =
      currentPrompt !== null && currentPrompt.canManageProviders !== canManageProviders;
    if (
      (currentPrompt && !updateExistingPrompt) ||
      !canOfferProviderUpdate({
        key: notificationKey,
        manuallyChecked: checkedManually,
        dismissedKeys: dismissedNotificationKeys,
        seenKeys: seenProviderUpdateNotificationKeys,
        replaceExisting: updateExistingPrompt,
      })
    ) {
      return;
    }

    seenProviderUpdateNotificationKeys.add(notificationKey);

    const initialView = getProviderUpdateInitialToastView({ updateProviders, oneClickProviders });

    let toastId!: ProviderUpdateToastId;
    const openSettings = () => openProviderSettings(toastId);
    const dismissPrompt = () => {
      dismissNotificationKey(notificationKey);
      if (activeToastRef.current?.toastId === toastId) activeToastRef.current = null;
    };

    const toastOptions = buildUpdatePrompt({
      view: initialView,
      providers: updateProviders,
      canUpdate: oneClickProviders.length > 0,
      canManageProviders,
      openSettings,
      update: () => void runUpdates(toastId, primaryEnvironment?.environmentId, oneClickProviders),
      dismiss: dismissPrompt,
    });
    if (currentPrompt) {
      toastId = currentPrompt.toastId;
      toastManager.update(toastId, toastOptions);
    } else {
      toastId = toastManager.add(toastOptions);
    }
    activeToastRef.current = { kind: "prompt", key: notificationKey, toastId, canManageProviders };
  }, [
    canManageProviders,
    runUpdates,
    dismissNotificationKey,
    dismissedNotificationKeys,
    notificationKey,
    manualCheck,
    oneClickProviders,
    openProviderSettings,
    primaryEnvironment,
    updateProviders,
  ]);

  return null;
}
