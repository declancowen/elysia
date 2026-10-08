import { APP_NAME, type DesktopUpdateChannel } from "@elysiatools/contracts";

const NIGHTLY_VERSION_PATTERN = /^[^-+]+-nightly\.\d{8}\.\d+$/;
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/;
// Preview builds are the maintainers' test train, cut by hand from unreleased
// branches to exercise the release flow. They share nightly's branding but
// are packaged without an update feed (see
// isDesktopPreviewVersion in scripts/build-desktop-artifact.ts), so the
// channel a preview install reports is cosmetic: it never checks for updates
// and no updater feed ever lists a preview release.
const PRERELEASE_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.\d{8}\.\d+$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return PRERELEASE_VERSION_PATTERN.test(version);
}

// Feed versions keep their release train even when the fork forces latest.
export function resolveDesktopReleaseChannel(version: string): DesktopUpdateChannel | null {
  if (NIGHTLY_VERSION_PATTERN.test(version)) return "nightly";
  return STABLE_VERSION_PATTERN.test(version) ? "latest" : null;
}

export function resolveDefaultDesktopUpdateChannel(appVersion: string): DesktopUpdateChannel {
  if (APP_NAME === "Elysia") return "latest";
  return NIGHTLY_VERSION_PATTERN.test(appVersion) ? "nightly" : "latest";
}
