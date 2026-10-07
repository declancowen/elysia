#!/bin/bash
# Run after reproducing the failed update. Reads installed bundles and updater
# diagnostics; never starts an app, changes its profile, or installs anything.
set -u

if [[ "$(uname -s)" != Darwin ]]; then
  echo "This diagnostic is for macOS." >&2
  exit 1
fi

redact_urls() {
  sed -E 's@https?://[^[:space:]"<>]+@[URL omitted]@g'
}

echo "Elysia updater diagnostic"
date -u '+UTC: %Y-%m-%dT%H:%M:%SZ'
sw_vers
printf 'Host architecture: '
uname -m

if [[ $# -gt 0 ]]; then
  app_paths=("$1")
else
  app_paths=(/Applications/Elysia.app "$HOME/Applications/Elysia.app" "$HOME/Desktop/Elysia.app")
fi

found=false
for app_path in "${app_paths[@]}"; do
  [[ -d "$app_path/Contents" ]] || continue
  found=true
  printf '\nApp: %s\n' "$app_path"
  for key in CFBundleShortVersionString CFBundleVersion CFBundleIdentifier; do
    printf '%s: ' "$key"
    /usr/libexec/PlistBuddy -c "Print :$key" "$app_path/Contents/Info.plist" 2>&1
  done
  [[ -w "$app_path" ]] && echo 'Bundle writable: yes' || echo 'Bundle writable: no'
  [[ -w "$(dirname "$app_path")" ]] && echo 'Parent writable: yes' || echo 'Parent writable: no'
  /usr/bin/file "$app_path/Contents/MacOS/Elysia"
  printf 'Canonical bundle path: '
  (cd "$app_path" && pwd -P)
  echo 'Signature:'
  /usr/bin/codesign --verify --deep --strict --verbose=2 "$app_path" 2>&1
  /usr/bin/codesign -d -r- --verbose=2 "$app_path" 2>&1
  echo 'Bundled updater feed:'
  if [[ -f "$app_path/Contents/Resources/app-update.yml" ]]; then
    # The configured public repository and cache name suffice; never print tokens.
    sed -nE '/^(provider|owner|repo|channel|updaterCacheDirName):/p' \
      "$app_path/Contents/Resources/app-update.yml" | redact_urls
  else
    echo 'app-update.yml missing'
  fi
done
[[ "$found" == true ]] || echo 'No Elysia app found. Pass its full .app path as the first argument.'

echo
echo 'Public update endpoint checks (no credentials or download):'
for endpoint in \
  'https://github.com/declancowen/elysia/releases.atom' \
  'https://github.com/declancowen/elysia/releases/latest' \
  'https://github.com/declancowen/elysia/releases/latest/download/latest-mac.yml'; do
  printf '%s: ' "$endpoint"
  /usr/bin/curl -sS -L --connect-timeout 10 --max-time 30 -o /dev/null \
    -w 'HTTP %{http_code}\n' "$endpoint" 2>&1 | redact_urls
done

echo
echo 'Recent Elysia updater events (excludes chat content and credentials):'
trace_path="$HOME/.elysia/userdata/logs/desktop.trace.ndjson"
if [[ -f "$trace_path" ]]; then
  tail -n 5000 "$trace_path" | /usr/bin/osascript -l JavaScript -e '
    ObjC.import("Foundation");
    const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
    const raw = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
    const result = [];
    for (const line of raw.split("\n")) {
      let span;
      try { span = JSON.parse(line); } catch (_) { continue; }
      for (const event of span.events || []) {
        if (event.attributes?.component !== "desktop-updater") continue;
        const item = { message: String(event.name).replace(/https?:\/\/\S+/g, "[URL omitted]") };
        if (span.endTimeUnixNano) item.at = new Date(Number(span.endTimeUnixNano) / 1e6).toISOString();
        for (const key of ["channel", "version", "reason", "errorTag", "operation"])
          if (event.attributes[key] !== undefined) item[key] = event.attributes[key];
        result.push(JSON.stringify(item));
      }
    }
    result.slice(-40).join("\n");
  ' 2>&1
else
  echo 'No desktop trace file found.'
fi

echo
echo 'Native macOS installer errors:'
for shipit_dir in "$HOME/Library/Caches/com.informa.elysia" \
  "$HOME/Library/Caches/com.informa.elysia.ShipIt" \
  "$HOME/Library/Application Support/com.informa.elysia.ShipIt"; do
  for log_name in ShipIt_stderr.log ShipIt_stdout.log; do
    log_path="$shipit_dir/$log_name"
    [[ -f "$log_path" ]] || continue
    printf '\n%s\n' "$log_path"
    tail -n 60 "$log_path" | redact_urls
  done
done
echo 'Recent system installer errors (may be unavailable under macOS log privacy):'
/usr/bin/log show --last 30m --style compact --predicate \
  'process == "ShipIt" AND (eventMessage CONTAINS[c] "elysia" OR eventMessage CONTAINS[c] "error" OR eventMessage CONTAINS[c] "fail")' \
  2>&1 | tail -n 60 | redact_urls
