import { APP_NAME, type DesktopUpdateChannel } from "@elysiatools/contracts";

const NIGHTLY_VERSION_PATTERN = /^[^-+]+-nightly\.\d{8}\.\d+$/;
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/;
// Preview builds have no update feed and never appear in release feeds.
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
