import {
  AuthEnvironmentMaintainScope,
  sessionGrantsScope,
  type AuthSessionState,
  type ExecutionEnvironmentCapabilities,
  type ServerProvider,
} from "@t3tools/contracts";
import {
  cliReleaseChannelOf,
  cliReleaseIndexPageUrl,
  newestCliReleaseVersion,
} from "@t3tools/shared/cliRelease";
import { compareSemverVersions } from "@t3tools/shared/semver";
import * as Schema from "effect/Schema";

export function canMaintainEnvironment(session: AuthSessionState | null, connected: boolean) {
  return (
    connected &&
    session?.authenticated === true &&
    sessionGrantsScope(session, AuthEnvironmentMaintainScope)
  );
}

export function supportsEnvironmentUpdate(
  capabilities: Pick<ExecutionEnvironmentCapabilities, "serverSelfUpdate" | "desktopAppUpdate">,
) {
  return (
    capabilities.serverSelfUpdate !== undefined &&
    (capabilities.serverSelfUpdate !== "desktop-managed" || capabilities.desktopAppUpdate === true)
  );
}

export function canUpdateEnvironmentProvider(provider: ServerProvider, updateTarget?: "runtime") {
  const advisory =
    updateTarget === "runtime" ? provider.runtimeVersionAdvisory : provider.versionAdvisory;
  const compatibility =
    updateTarget === "runtime" || provider.runtimeVersion === undefined
      ? provider.compatibilityAdvisory?.latestVersionStatus
      : undefined;
  return (
    provider.installed &&
    provider.availability !== "unavailable" &&
    advisory?.status === "behind_latest" &&
    advisory.canUpdate &&
    advisory.latestVersion !== null &&
    compatibility !== "broken" &&
    compatibility !== "unsupported" &&
    provider.updateState?.status !== "running" &&
    provider.updateState?.status !== "queued" &&
    provider.runtimeUpdateState?.status !== "running" &&
    provider.runtimeUpdateState?.status !== "queued"
  );
}

const Releases = Schema.Array(
  Schema.Struct({
    tag_name: Schema.String,
    draft: Schema.optionalKey(Schema.Boolean),
  }),
);
const decodeReleases = Schema.decodeUnknownSync(Releases);

/** Preserve the host's release channel and never offer a downgrade. */
export async function findEnvironmentUpdate(currentVersion: string, signal: AbortSignal) {
  const channel = cliReleaseChannelOf(currentVersion);
  for (let page = 1; ; page++) {
    const response = await fetch(cliReleaseIndexPageUrl(page), { signal });
    if (!response.ok) throw new Error(`Could not check releases (${response.status}). Try again.`);
    const releases = decodeReleases(await response.json());
    const version = newestCliReleaseVersion(releases, channel);
    if (version !== undefined) {
      return compareSemverVersions(version, currentVersion) > 0 ? version : null;
    }
    if (releases.length < 100) throw new Error(`No ${channel} release was found.`);
  }
}
