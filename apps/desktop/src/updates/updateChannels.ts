import type { DesktopUpdateChannel } from "@elysiatools/contracts";

const NIGHTLY_VERSION_PATTERN = /^[^-+]+-nightly\.\d{8}\.\d+$/;
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/;

// Preview builds share nightly branding but ship without an update feed.
const PRERELEASE_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.\d{8}\.\d+$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return PRERELEASE_VERSION_PATTERN.test(version);
}

/** Feed eligibility differs from the track an installed preview build displays. */
export function resolveDesktopReleaseChannel(version: string): DesktopUpdateChannel | null {
  if (NIGHTLY_VERSION_PATTERN.test(version)) return "nightly";
  return STABLE_VERSION_PATTERN.test(version) ? "latest" : null;
}
