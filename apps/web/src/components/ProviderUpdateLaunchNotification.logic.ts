import { isEnabledProviderDriver } from "@t3tools/contracts";
import {
  defaultInstanceIdForDriver,
  PROVIDER_DISPLAY_NAMES,
  type EnvironmentId,
  type ExecutionEnvironmentPlatformOs,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";

export type ProviderUpdateSnapshot = ServerProvider & { readonly updateTarget?: "runtime" };

export function projectProviderUpdateTargets(
  providers: ReadonlyArray<ProviderUpdateSnapshot>,
): ProviderUpdateSnapshot[] {
  return providers.flatMap<ProviderUpdateSnapshot>((provider) => {
    if (provider.updateTarget === "runtime" || provider.runtimeVersion === undefined)
      return [provider];
    const {
      runtimeVersionAdvisory,
      runtimeUpdateState,
      compatibilityAdvisory,
      versionAdvisory,
      updateState,
      ...snapshot
    } = provider;
    const native = {
      ...snapshot,
      runtimeVersion: undefined,
      ...(versionAdvisory ? { versionAdvisory } : {}),
      ...(updateState ? { updateState } : {}),
    };
    if (!runtimeVersionAdvisory && !runtimeUpdateState) return [native];
    return [
      native,
      {
        ...snapshot,
        runtimeVersion: undefined,
        updateTarget: "runtime" as const,
        displayName: "Claude Code runtime",
        version: provider.runtimeVersion,
        ...(compatibilityAdvisory ? { compatibilityAdvisory } : {}),
        ...(runtimeVersionAdvisory ? { versionAdvisory: runtimeVersionAdvisory } : {}),
        ...(runtimeUpdateState ? { updateState: runtimeUpdateState } : {}),
      },
    ];
  });
}

function updateKey(provider: ProviderUpdateSnapshot): string {
  return `${provider.driver}${provider.updateTarget ? `:${provider.updateTarget}` : ""}`;
}

function updateName(provider: Pick<ProviderUpdateSnapshot, "driver" | "updateTarget">): string {
  return provider.updateTarget === "runtime"
    ? "Claude Code runtime"
    : (PROVIDER_DISPLAY_NAMES[provider.driver] ?? provider.driver);
}

export type ProviderUpdateCandidate = ProviderUpdateSnapshot & {
  readonly versionAdvisory: NonNullable<ProviderUpdateSnapshot["versionAdvisory"]> & {
    readonly status: "behind_latest";
    readonly latestVersion: string;
  };
};

export type ProviderSettingsUpdateCandidate = ProviderUpdateSnapshot & {
  readonly versionAdvisory: NonNullable<ProviderUpdateSnapshot["versionAdvisory"]> & {
    readonly canUpdate: true;
    readonly updateCommand: string;
  };
};

export type ProviderUpdateToastType = "warning" | "loading" | "error" | "success";
export type ProviderUpdateToastPhase = "initial" | "running" | "failed" | "unchanged" | "succeeded";

export interface ProviderUpdateToastView {
  readonly phase: ProviderUpdateToastPhase;
  readonly type: ProviderUpdateToastType;
  readonly title: string;
  readonly description: string;
  readonly dismissAfterVisibleMs?: number;
}

/**
 * Terminal update phases — outcomes that are safe to persist as a one-shot row
 * result. A non-terminal ("initial"/"running") snapshot never re-polls itself,
 * so storing one pins an update row's spinner indefinitely once its pending flag
 * expires; such phases must be dropped in favor of the live per-environment
 * provider state instead of being persisted.
 */
export function isTerminalProviderUpdatePhase(phase: ProviderUpdateToastPhase): boolean {
  return phase === "succeeded" || phase === "failed" || phase === "unchanged";
}

export type ProviderUpdateSidebarPillTone = "loading" | "warning" | "error" | "success";

export interface ProviderUpdateSidebarPillView {
  readonly key: string;
  readonly tone: ProviderUpdateSidebarPillTone;
  readonly title: string;
  readonly description: string;
  readonly dismissible?: boolean;
  readonly dismissAfterVisibleMs?: number;
}

interface ProviderUpdateSidebarPillOptions {
  readonly visibleAfterIso?: string;
  readonly dismissedKeys?: ReadonlySet<string>;
}

const PROVIDER_UPDATE_SUCCESS_VISIBLE_MS = 3_000;

function formatVersion(value: string): string {
  return value.startsWith("v") ? value : `v${value}`;
}

function chooseRepresentativeProvider(
  current: ProviderUpdateSnapshot | undefined,
  candidate: ProviderUpdateSnapshot,
): ProviderUpdateSnapshot {
  if (!current) {
    return candidate;
  }
  const defaultInstanceId = defaultInstanceIdForDriver(candidate.driver);
  if (candidate.instanceId === defaultInstanceId) {
    return candidate;
  }
  if (current.instanceId === defaultInstanceId) {
    return current;
  }
  return candidate.checkedAt.localeCompare(current.checkedAt) >= 0 ? candidate : current;
}

function dedupeProvidersByDriver<T extends ProviderUpdateSnapshot>(
  providers: ReadonlyArray<T>,
): T[] {
  const latestProviderByDriver = new Map<string, T>();

  for (const provider of providers) {
    if (!isEnabledProviderDriver(provider.driver)) continue;
    latestProviderByDriver.set(
      updateKey(provider),
      chooseRepresentativeProvider(latestProviderByDriver.get(updateKey(provider)), provider) as T,
    );
  }

  return [...latestProviderByDriver.values()];
}

function dedupeProvidersByInstanceId<T extends ProviderUpdateSnapshot>(
  providers: ReadonlyArray<T>,
): T[] {
  const latestProviderByInstanceId = new Map<string, T>();

  for (const provider of providers) {
    if (!isEnabledProviderDriver(provider.driver)) continue;
    const current = latestProviderByInstanceId.get(
      `${provider.instanceId}:${provider.updateTarget ?? ""}`,
    );
    if (!current || provider.checkedAt.localeCompare(current.checkedAt) >= 0) {
      latestProviderByInstanceId.set(
        `${provider.instanceId}:${provider.updateTarget ?? ""}`,
        provider,
      );
    }
  }

  return [...latestProviderByInstanceId.values()];
}

function getProviderUpdatedTitle(
  provider: Pick<ProviderUpdateSnapshot, "driver" | "version" | "updateTarget">,
): string {
  const providerName = updateName(provider);
  return provider.version
    ? `${providerName} updated: ${formatVersion(provider.version)}`
    : `${providerName} updated`;
}

function getProviderUpdatedDescription(providerCount: number): string {
  return providerCount === 1
    ? "New sessions will use the updated provider."
    : "New sessions will use the updated providers.";
}

function getProviderFailedUpdateTitle(
  provider: Pick<ProviderUpdateSnapshot, "driver" | "versionAdvisory" | "updateTarget">,
): string {
  const providerName = updateName(provider);
  const attemptedVersion = provider.versionAdvisory?.latestVersion;
  return attemptedVersion
    ? `${providerName} ${formatVersion(attemptedVersion)} update failed`
    : `${providerName} update failed`;
}

export function isProviderUpdateCandidate(
  provider: ProviderUpdateSnapshot,
): provider is ProviderUpdateCandidate {
  return (
    isEnabledProviderDriver(provider.driver) &&
    provider.enabled &&
    provider.compatibilityAdvisory?.latestVersionStatus !== "broken" &&
    provider.compatibilityAdvisory?.latestVersionStatus !== "unsupported" &&
    provider.versionAdvisory?.status === "behind_latest" &&
    provider.versionAdvisory.latestVersion !== null
  );
}

export function isProviderUpdateActive(
  provider: Pick<ProviderUpdateSnapshot, "updateState">,
): boolean {
  return provider.updateState?.status === "queued" || provider.updateState?.status === "running";
}

export function collectProviderUpdateCandidates(
  providers: ReadonlyArray<ProviderUpdateSnapshot>,
): ProviderUpdateCandidate[] {
  return dedupeProvidersByDriver(
    projectProviderUpdateTargets(providers).filter(isProviderUpdateCandidate),
  );
}

export function isProviderSettingsUpdateCandidate(
  provider: ProviderUpdateSnapshot,
): provider is ProviderSettingsUpdateCandidate {
  return (
    isEnabledProviderDriver(provider.driver) &&
    provider.enabled &&
    provider.compatibilityAdvisory?.latestVersionStatus !== "broken" &&
    provider.compatibilityAdvisory?.latestVersionStatus !== "unsupported" &&
    provider.versionAdvisory?.status === "behind_latest" &&
    provider.versionAdvisory.canUpdate === true &&
    provider.versionAdvisory.updateCommand !== null
  );
}

export function hasOneClickUpdateProviderCandidate(
  candidate: ProviderUpdateCandidate,
  providers: ReadonlyArray<ProviderUpdateSnapshot>,
): boolean {
  if (
    candidate.versionAdvisory.canUpdate !== true ||
    candidate.versionAdvisory.updateCommand === null
  ) {
    return false;
  }

  const driverProviders = projectProviderUpdateTargets(providers).filter(
    (provider) => updateKey(provider) === updateKey(candidate),
  );
  if (driverProviders.length === 0) {
    return false;
  }

  const updateCommands = new Set<string>();
  for (const provider of driverProviders) {
    if (!isProviderUpdateCandidate(provider)) {
      continue;
    }
    const advisory = provider.versionAdvisory;
    if (!advisory || advisory.canUpdate !== true || advisory.updateCommand === null) {
      return false;
    }
    updateCommands.add(advisory.updateCommand);
  }

  return updateCommands.size === 1;
}

export function canOneClickUpdateProviderCandidate(
  candidate: ProviderUpdateCandidate,
  providers: ReadonlyArray<ProviderUpdateSnapshot>,
): boolean {
  return (
    !isProviderUpdateActive(candidate) && hasOneClickUpdateProviderCandidate(candidate, providers)
  );
}

export function providerUpdateNotificationKey(
  providers: ReadonlyArray<ProviderUpdateCandidate>,
): string | null {
  const parts = dedupeProvidersByDriver(providers)
    .map((provider) => {
      const advisory = provider.versionAdvisory;
      return [updateKey(provider), advisory.latestVersion].join(":");
    })
    .toSorted();

  return parts.length > 0 ? parts.join("|") : null;
}

function formatProviderList(
  providers: ReadonlyArray<Pick<ProviderUpdateSnapshot, "driver" | "updateTarget">>,
) {
  const names = providers.map((provider) => updateName(provider));
  if (names.length <= 2) {
    return names.join(" and ");
  }
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function getProviderUpdateInitialToastView(input: {
  readonly updateProviders: ReadonlyArray<ProviderUpdateCandidate>;
  readonly oneClickProviders: ReadonlyArray<ProviderUpdateCandidate>;
}): ProviderUpdateToastView {
  return {
    phase: "initial",
    type: "warning",
    title: getProviderUpdateInitialToastTitle(input.updateProviders),
    description:
      input.oneClickProviders.length > 0
        ? "Install the update now or review provider settings."
        : `${formatProviderList(input.updateProviders)} can be updated from provider settings.`,
  };
}

export function shouldShowPrimaryProviderUpdateToast(view: ProviderUpdateToastView): boolean {
  return view.phase !== "running";
}

function getProviderUpdateRunningToastView(providerCount: number): ProviderUpdateToastView {
  return {
    phase: "running",
    type: "loading",
    title: providerCount === 1 ? "Updating provider" : "Updating providers",
    description: "Running provider update command.",
  };
}

export function getProviderUpdateRejectedToastView(
  providerCount: number,
  message: string,
): ProviderUpdateToastView {
  return {
    phase: "failed",
    type: "error",
    title: providerCount === 1 ? "Provider update failed" : "Provider updates failed",
    description: message,
  };
}

export function getProviderUpdateProgressToastView(input: {
  readonly providers: ReadonlyArray<ProviderUpdateSnapshot>;
  readonly providerCount: number;
}): ProviderUpdateToastView {
  const providers = dedupeProvidersByDriver(projectProviderUpdateTargets(input.providers));
  const failedProviders = providers.filter((provider) => provider.updateState?.status === "failed");
  if (failedProviders.length > 0) {
    return {
      phase: "failed",
      type: "error",
      title: failedProviders.length === 1 ? "Provider update failed" : "Provider updates failed",
      description: getFailedProviderUpdateDescription(failedProviders),
    };
  }

  const unchangedProviders = providers.filter(
    (provider) => provider.updateState?.status === "unchanged",
  );
  if (unchangedProviders.length > 0) {
    return {
      phase: "unchanged",
      type: "warning",
      title:
        unchangedProviders.length === 1
          ? "Provider still needs an update"
          : "Providers still need updates",
      description: `${formatProviderList(unchangedProviders)} ${
        unchangedProviders.length === 1 ? "still appears" : "still appear"
      } outdated. Check provider settings for details.`,
    };
  }

  if (providers.some(isProviderUpdateActive)) {
    return getProviderUpdateRunningToastView(input.providerCount);
  }

  const hasCompleteProviderSnapshots = providers.length >= input.providerCount;
  const allProvidersUpdated =
    hasCompleteProviderSnapshots &&
    providers.every(
      (provider) =>
        provider.updateState?.status === "succeeded" || !isProviderUpdateCandidate(provider),
    );
  if (allProvidersUpdated) {
    return {
      phase: "succeeded",
      type: "success",
      title: input.providerCount === 1 ? "Provider updated" : "Provider updates finished",
      description: getProviderUpdatedDescription(input.providerCount),
      dismissAfterVisibleMs: PROVIDER_UPDATE_SUCCESS_VISIBLE_MS,
    };
  }

  return getProviderUpdateRunningToastView(input.providerCount);
}

export function collectUpdatedProviderSnapshots(input: {
  readonly results: ReadonlyArray<
    AtomCommandResult<{ readonly providers: ReadonlyArray<ProviderUpdateSnapshot> }, unknown>
  >;
  readonly providerInstanceIds: ReadonlySet<ProviderInstanceId>;
}): ProviderUpdateSnapshot[] {
  const matchedProviders: ProviderUpdateSnapshot[] = [];

  for (const result of input.results) {
    if (result._tag === "Failure") {
      continue;
    }
    for (const provider of projectProviderUpdateTargets(result.value.providers)) {
      if (
        isEnabledProviderDriver(provider.driver) &&
        input.providerInstanceIds.has(provider.instanceId)
      ) {
        matchedProviders.push(provider);
      }
    }
  }

  return dedupeProvidersByInstanceId(matchedProviders);
}

export function firstFailedProviderUpdateMessage(
  results: ReadonlyArray<AtomCommandResult<unknown, unknown>>,
): string | null {
  const failed = results.find((result) => result._tag === "Failure");
  if (!failed || failed._tag !== "Failure") {
    return null;
  }
  const error = squashAtomCommandFailure(failed);
  return error instanceof Error ? error.message : "Provider update failed.";
}

function getUpdateFinishedAt(provider: ProviderUpdateSnapshot): string | null {
  return provider.updateState?.finishedAt ?? null;
}

function isRecentTerminalProvider(
  provider: ProviderUpdateSnapshot,
  visibleAfterIso: string | undefined,
): boolean {
  const status = provider.updateState?.status;
  if (status !== "failed" && status !== "unchanged" && status !== "succeeded") {
    return false;
  }
  if (visibleAfterIso === undefined) {
    return true;
  }
  const finishedAt = getUpdateFinishedAt(provider);
  return finishedAt !== null && finishedAt >= visibleAfterIso;
}

function latestFinishedAtForProviders(
  providers: ReadonlyArray<ProviderUpdateSnapshot>,
): string | null {
  return providers.reduce<string | null>((latest, provider) => {
    const finishedAt = getUpdateFinishedAt(provider);
    if (finishedAt === null) {
      return latest;
    }
    return latest === null || finishedAt > latest ? finishedAt : latest;
  }, null);
}

export function getProviderUpdateSidebarPillView(
  providers: ReadonlyArray<ProviderUpdateSnapshot>,
  options?: ProviderUpdateSidebarPillOptions,
): ProviderUpdateSidebarPillView | null {
  const dedupedProviders = dedupeProvidersByDriver(projectProviderUpdateTargets(providers));
  const activeProviders = dedupedProviders.filter(isProviderUpdateActive);
  if (activeProviders.length > 0) {
    const activeProvider = activeProviders[0]!;
    const activeProviderName = updateName(activeProvider);
    return {
      key: `loading:${activeProviders
        .map((provider) => `${updateKey(provider)}:${provider.updateState?.status ?? "idle"}`)
        .toSorted()
        .join("|")}`,
      tone: "loading",
      title:
        activeProviders.length === 1
          ? `Updating ${activeProviderName}`
          : `Updating ${activeProviders.length} providers`,
      description:
        activeProviders.length === 1
          ? `${formatProviderList(activeProviders)} update in progress.`
          : `${formatProviderList(activeProviders)} updates are in progress.`,
    };
  }

  const recentTerminalProviders = dedupedProviders.filter((provider) =>
    isRecentTerminalProvider(provider, options?.visibleAfterIso),
  );
  const terminalCandidates: ProviderUpdateSidebarPillView[] = [];

  const failedProviders = recentTerminalProviders.filter(
    (provider) => provider.updateState?.status === "failed",
  );
  if (failedProviders.length > 0) {
    const failedProvider = failedProviders[0]!;
    terminalCandidates.push({
      key: `failed:${failedProviders
        .map(
          (provider) =>
            `${updateKey(provider)}:${provider.updateState?.finishedAt ?? "pending"}:${provider.updateState?.message ?? ""}`,
        )
        .toSorted()
        .join("|")}`,
      tone: "error",
      title:
        failedProviders.length === 1
          ? getProviderFailedUpdateTitle(failedProvider)
          : `${failedProviders.length} provider updates failed`,
      description: getFailedProviderUpdateDescription(failedProviders),
      dismissible: true,
    });
  }

  const unchangedProviders = recentTerminalProviders.filter(
    (provider) => provider.updateState?.status === "unchanged",
  );
  if (unchangedProviders.length > 0) {
    const unchangedProvider = unchangedProviders[0]!;
    const unchangedProviderName = updateName(unchangedProvider);
    terminalCandidates.push({
      key: `unchanged:${unchangedProviders
        .map(
          (provider) =>
            `${updateKey(provider)}:${provider.updateState?.finishedAt ?? "pending"}:${provider.updateState?.message ?? ""}`,
        )
        .toSorted()
        .join("|")}`,
      tone: "warning",
      title:
        unchangedProviders.length === 1
          ? `${unchangedProviderName} still needs an update`
          : `${unchangedProviders.length} providers still need updates`,
      description: `${formatProviderList(unchangedProviders)} ${
        unchangedProviders.length === 1 ? "still appears" : "still appear"
      } outdated. Review provider settings for details.`,
      dismissible: true,
    });
  }

  const succeededProviders = recentTerminalProviders.filter(
    (provider) => provider.updateState?.status === "succeeded",
  );
  if (succeededProviders.length > 0) {
    const succeededProvider = succeededProviders[0]!;
    terminalCandidates.push({
      key: `succeeded:${succeededProviders
        .map(
          (provider) =>
            `${updateKey(provider)}:${provider.updateState?.finishedAt ?? "pending"}:${provider.updateState?.message ?? ""}`,
        )
        .toSorted()
        .join("|")}`,
      tone: "success",
      title:
        succeededProviders.length === 1
          ? getProviderUpdatedTitle(succeededProvider)
          : `${succeededProviders.length} providers updated`,
      description: getProviderUpdatedDescription(succeededProviders.length),
      dismissAfterVisibleMs: PROVIDER_UPDATE_SUCCESS_VISIBLE_MS,
    });
  }

  return (
    terminalCandidates
      .toSorted((left, right) => {
        const leftProviders =
          left.tone === "error"
            ? failedProviders
            : left.tone === "warning"
              ? unchangedProviders
              : succeededProviders;
        const rightProviders =
          right.tone === "error"
            ? failedProviders
            : right.tone === "warning"
              ? unchangedProviders
              : succeededProviders;
        const leftFinishedAt = latestFinishedAtForProviders(leftProviders) ?? "";
        const rightFinishedAt = latestFinishedAtForProviders(rightProviders) ?? "";
        return rightFinishedAt.localeCompare(leftFinishedAt);
      })
      .find((candidate) => !options?.dismissedKeys?.has(candidate.key)) ?? null
  );
}

function getProviderUpdateInitialToastTitle(
  providers: ReadonlyArray<ProviderUpdateCandidate>,
): string {
  if (providers.length === 1) {
    const provider = providers[0]!;
    const providerName = updateName(provider);
    return `Update Available: ${providerName} ${formatVersion(provider.versionAdvisory.latestVersion)}`;
  }
  return `Updates Available: ${providers.length} providers`;
}

function getFailedProviderUpdateDescription(
  providers: ReadonlyArray<ProviderUpdateSnapshot>,
): string {
  if (providers.length === 1) {
    const provider = providers[0]!;
    if (provider.updateState?.message) {
      return provider.updateState.message;
    }
  }
  return `${formatProviderList(providers)} failed to update. Check provider settings for details.`;
}

// ===========================================================================
// Multi-environment provider updates
//
// With a desktop-local secondary backend present (the WSL backend alongside the
// Windows primary), a provider update is applied across every local backend.
// Each environment owns its own provider instances, so candidates and progress
// are computed per environment and the dispatch targets that environment's
// connection. These helpers are pure; the dispatch itself runs through the
// `serverEnvironment.updateProvider` atom command in the components.
// ===========================================================================

/**
 * The settled result of dispatching a provider update to one local backend.
 * `provider` is the post-update snapshot of the targeted instance returned by
 * that backend (null when the backend did not report the targeted instance,
 * e.g. it does not have it installed).
 */
export interface LocalProviderUpdateOutcome {
  readonly environmentId: EnvironmentId;
  readonly isPrimary: boolean;
  readonly driver: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ProviderUpdateSnapshot | null;
}

// Worst-case ordering across backends: a failed copy outranks an unchanged one,
// which outranks a still-running one, which outranks a succeeded one.
const PROVIDER_UPDATE_STATUS_SEVERITY: Record<string, number> = {
  succeeded: 1,
  queued: 2,
  running: 2,
  unchanged: 3,
  failed: 4,
};

function providerUpdateOutcomeSeverity(provider: ProviderUpdateSnapshot): number {
  return PROVIDER_UPDATE_STATUS_SEVERITY[provider.updateState?.status ?? ""] ?? 0;
}

export function firstRejectedProviderUpdateMessage(
  results: ReadonlyArray<PromiseSettledResult<unknown>>,
): string | null {
  const rejected = results.find((result) => result.status === "rejected");
  if (!rejected) {
    return null;
  }
  return rejected.reason instanceof Error ? rejected.reason.message : "Provider update failed.";
}

/**
 * Reduce per-backend update outcomes to one representative snapshot per driver,
 * keeping the worst-case status across every local backend. Because the same
 * driver has a distinct instance id per environment, a secondary backend (e.g.
 * WSL) that *resolved* with a failed or unchanged provider would otherwise be
 * filtered out (its instance id is not the primary's) or collapsed behind the
 * primary's success — this surfaces it instead.
 */
export function collectProviderUpdateOutcomeSnapshots(
  results: ReadonlyArray<PromiseSettledResult<LocalProviderUpdateOutcome>>,
): ProviderUpdateSnapshot[] {
  const worstByDriver = new Map<string, ProviderUpdateSnapshot>();
  for (const result of results) {
    if (result.status !== "fulfilled" || result.value.provider === null) {
      continue;
    }
    const provider = result.value.provider;
    const current = worstByDriver.get(updateKey(provider));
    if (
      !current ||
      providerUpdateOutcomeSeverity(provider) > providerUpdateOutcomeSeverity(current)
    ) {
      worstByDriver.set(updateKey(provider), provider);
    }
  }
  return [...worstByDriver.values()];
}

/**
 * A human label that distinguishes local environments by platform (so the
 * popover shows "Windows" / "WSL" rather than the account name twice). WSL is
 * identified by its backend instance id; everything else falls back to the
 * reported OS, then the environment's own label.
 */
export function deriveEnvironmentDisplayLabel(input: {
  readonly isWsl: boolean;
  readonly wslDistro: string | null;
  readonly platformOs: ExecutionEnvironmentPlatformOs | undefined;
  readonly fallbackLabel: string;
}): string {
  if (input.isWsl) {
    return input.wslDistro ? `WSL · ${input.wslDistro}` : "WSL";
  }
  switch (input.platformOs) {
    case "windows":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return input.fallbackLabel;
  }
}

/** Connection state of a local environment, normalized across primary/secondary sources. */
export type EnvironmentUpdateConnectionState = "connecting" | "ready" | "disconnected" | "error";

export interface LocalEnvironmentProvidersInput {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly isPrimary: boolean;
  readonly connectionState: EnvironmentUpdateConnectionState;
  readonly providers: ReadonlyArray<ProviderUpdateSnapshot>;
}

export interface LocalEnvironmentUpdateGroup {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly isPrimary: boolean;
  /** True while this environment's backend is still connecting (e.g. WSL booting). */
  readonly isSettling: boolean;
  /** Outdated, one-click-updatable providers in this environment. */
  readonly candidates: ProviderUpdateCandidate[];
  /** Full provider list for this environment, used to derive live update progress. */
  readonly providers: ReadonlyArray<ProviderUpdateSnapshot>;
}

/**
 * Build one update group per local environment, pairing each environment's
 * outdated one-click candidates with its own provider list, and report whether
 * any environment is still settling (so the caller can defer the popover).
 */
export function buildLocalEnvironmentUpdateGroups(
  environments: ReadonlyArray<LocalEnvironmentProvidersInput>,
): { groups: LocalEnvironmentUpdateGroup[]; isAnySettling: boolean } {
  const groups = environments.map((environment) => ({
    environmentId: environment.environmentId,
    label: environment.label,
    isPrimary: environment.isPrimary,
    isSettling: environment.connectionState === "connecting",
    candidates: collectProviderUpdateCandidates(environment.providers).filter((candidate) =>
      canOneClickUpdateProviderCandidate(candidate, environment.providers),
    ),
    providers: environment.providers,
  }));
  const isAnySettling = environments.some(
    (environment) => environment.connectionState === "connecting",
  );
  return { groups, isAnySettling };
}

/** Groups that actually have a one-click update available, in display order (primary first). */
export function environmentGroupsWithUpdates(
  groups: ReadonlyArray<LocalEnvironmentUpdateGroup>,
): LocalEnvironmentUpdateGroup[] {
  return groups.filter((group) => group.candidates.length > 0);
}

/**
 * Stable key over the set of (environment, driver, latest version) updates on
 * offer, so the popover is shown once per distinct set and re-shown when it
 * changes.
 */
export function localEnvironmentUpdateNotificationKey(
  groups: ReadonlyArray<LocalEnvironmentUpdateGroup>,
): string | null {
  const parts = environmentGroupsWithUpdates(groups)
    .map((group) => {
      const providerParts = group.candidates
        .map((candidate) => `${updateKey(candidate)}:${candidate.versionAdvisory.latestVersion}`)
        .toSorted()
        .join(",");
      return `${group.environmentId}=${providerParts}`;
    })
    .toSorted();
  return parts.length > 0 ? parts.join("|") : null;
}

export type ProviderUpdateRowStatusKind = "idle" | "loading" | "success" | "failed" | "unchanged";

export interface ProviderUpdateRowStatus {
  readonly kind: ProviderUpdateRowStatusKind;
  readonly text: string;
}

function environmentProviderNames(group: LocalEnvironmentUpdateGroup): string {
  return group.candidates.map((candidate) => updateName(candidate)).join(", ");
}

/**
 * Resolve one environment row's display from every available signal, in
 * priority order: a transport rejection, then the dispatch's own *terminal*
 * result payload (reliable even when a secondary backend's config does not
 * re-sync), then live server state (reliable even when the dispatch RPC is lost
 * to a reconnect), then the optimistic pending spinner, then the idle state.
 *
 * A non-terminal result snapshot ("running") is intentionally skipped rather
 * than treated as authoritative, so live server state can still drive the row
 * to its terminal status instead of pinning it on "Updating…".
 */
export function resolveEnvironmentUpdateRowStatus(input: {
  readonly group: LocalEnvironmentUpdateGroup;
  readonly error: string | undefined;
  readonly result: ProviderUpdateToastView | undefined;
  readonly pill: ProviderUpdateSidebarPillView | null;
  readonly isPending: boolean;
}): ProviderUpdateRowStatus {
  if (input.error) {
    return { kind: "failed", text: input.error };
  }
  if (input.result) {
    switch (input.result.phase) {
      case "succeeded":
        return { kind: "success", text: "Updated" };
      case "failed":
        return { kind: "failed", text: input.result.description };
      case "unchanged":
        return { kind: "unchanged", text: input.result.description };
      // "running" / "initial": non-terminal snapshot — fall through to live state.
    }
  }
  if (input.pill) {
    switch (input.pill.tone) {
      case "success":
        return { kind: "success", text: "Updated" };
      case "error":
        return { kind: "failed", text: input.pill.description };
      case "warning":
        return { kind: "unchanged", text: input.pill.description };
      default:
        return { kind: "loading", text: "Updating…" };
    }
  }
  // A non-terminal result snapshot or the optimistic pending flag means an
  // update is still in flight — keep showing the spinner rather than reverting
  // to the Update button as if nothing happened.
  if (input.result || input.isPending) {
    return { kind: "loading", text: "Updating…" };
  }
  return { kind: "idle", text: environmentProviderNames(input.group) };
}
