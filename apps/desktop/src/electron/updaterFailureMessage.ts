import { APP_NAME } from "@elysiatools/contracts";

export const UPDATE_INSTALL_LOCATION_MESSAGE = `Quit ${APP_NAME}, move it to Applications, then reopen it there before updating.`;

const hints: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\b(?:ERR_CERT_AUTHORITY_INVALID|ERR_CERT_DATE_INVALID|ERR_CERT_COMMON_NAME_INVALID|ERR_CERT_REVOKED|ERR_CERT_INVALID|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT)\b/,
    "The release server certificate could not be verified",
  ],
  [
    /\b(?:ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED)\b/,
    "The connection through your network proxy failed",
  ],
  [
    /\b(?:ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN)\b/,
    "The release server address could not be resolved",
  ],
  [
    /\b(?:ERR_INTERNET_DISCONNECTED|ENETUNREACH|EHOSTUNREACH)\b/,
    "The release server could not be reached",
  ],
  [
    /\b(?:ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ETIMEDOUT)\b/,
    "The connection to the release server timed out",
  ],
  [
    /\b(?:ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ECONNRESET|ECONNREFUSED)\b/,
    "The connection to the release server was interrupted or refused",
  ],
  [/\bERR_UPDATER_CHANNEL_FILE_NOT_FOUND\b/, "The release is missing its update manifest"],
  [/\bERR_UPDATER_ZIP_FILE_NOT_FOUND\b/, "The release is missing its macOS update archive"],
  [/\bERR_UPDATER_LATEST_VERSION_NOT_FOUND\b/, "The latest release could not be read"],
  [/\bERR_UPDATER_INVALID_RELEASE_FEED\b/, "The release feed could not be read"],
  [/\bERR_CHECKSUM_MISMATCH\b/, "The downloaded update did not match its published checksum"],
  [/\bERR_UPDATER_INVALID_SIGNATURE\b/, "The downloaded update signature could not be verified"],
  [/\bEROFS\b/, "The update could not be saved or installed in a read-only location"],
  [/\b(?:EACCES|EPERM)\b/, "Permission to install or save the update was denied"],
];

// Updater errors can contain signed URLs, headers and entire HTTP responses. Keep only known codes.
export function updaterFailureMessage(summary: string, cause: unknown): string {
  const metadata = typeof cause === "object" && cause !== null ? cause : null;
  const code =
    metadata && "code" in metadata && typeof metadata.code === "string" ? metadata.code : "";
  const message =
    typeof cause === "string"
      ? cause
      : metadata && "message" in metadata && typeof metadata.message === "string"
        ? metadata.message
        : "";
  const diagnostic = `${code} ${message.slice(0, 4096)}`;
  if (/\brunning on a read-only volume\b/i.test(diagnostic)) {
    return `${summary} ${UPDATE_INSTALL_LOCATION_MESSAGE}`;
  }
  for (const [pattern, hint] of hints) {
    const match = diagnostic.match(pattern);
    if (match) return `${summary} ${hint} (${match[0]}). Retry when the issue is resolved.`;
  }
  const status = metadata && "statusCode" in metadata ? metadata.statusCode : undefined;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599)
    return `${summary} The release server returned HTTP ${status}. Retry when the issue is resolved.`;
  return summary;
}
