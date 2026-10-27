# Elysia integration architecture decisions

These records explain integration constraints that span the GUI, server and native runtime. They are the baseline for native CLI updates and upstream integrations, alongside the [compatibility history](../operations/cli-compatibility.md). Release notes alone do not prove compatibility. Keep credentials, private endpoints and local account details out of this file.

When a CLI update or upstream change affects a decision, add a dated replacement explaining the evidence and link both records. A version bump without a changed constraint belongs in the compatibility history. Each assessment must distinguish inspected source, controlled native execution and live company verification.

## CLI-001: Native authentication ownership

**Accepted, 2026-10-26.** Applies to macOS and Windows. Reaffirmed against native CLI 0.3.11 after regressions in existing-sign-in reuse.

The CLI owns authentication, credential validation, certificate trust and setup. Elysia first reuses a native sign-in and only presents credential entry when the CLI requires it. The GUI must not introduce its own gateway request, VPN check or certificate export as an admission requirement. Those checks duplicated native policy and rejected sign-ins that worked in the terminal.

Keep this boundary in [ElysiaCli](../../apps/server/src/provider/ElysiaCli.ts). Revisit only if the CLI publishes a different supported authentication contract. A setup error must retain its native meaning; do not infer that credentials or network trust are invalid from an unrelated optional plugin failure.

## CLI-002: Native model configuration with per-query isolation

**Accepted, 2026-10-26.** Baseline: native CLI 0.3.11.

The installed CLI determines available models, model-specific headers, context length and compaction windows. Elysia applies its native model transformation to an isolated settings copy for each query. It must not switch the user's saved default to route a thread. This preserves independent concurrent threads and removes retired choices without recreating native routing rules in the UI.

Claude's saved `settings.env` overrides the process environment. A process environment override alone therefore leaves stale routing headers active. [Query settings](../../apps/server/src/provider/ElysiaQuerySettings.ts) place the native model overrides in a private highest-precedence settings file, with cleanup tied to the child process lifetime. Private headers must not be placed in command arguments. A controlled run of the bundled native Claude runtime verified the Sol header is present for Sol and absent for DeepSeek despite stale Sol settings, without changing saved settings. This is transport verification, not live company authentication.

The SDK rejects a settings-file path together with its top-level `sandbox` option. Serialize the complete per-query sandbox policy into the private settings file before handing it to the SDK; omit only the redundant SDK option. The startup regression in app 0.0.41 occurred before the CLI launched. Regression proof must exercise the real SDK with the complete production query options, including protection, rather than testing native routing and sandbox settings separately.

Revisit if the CLI exposes a supported per-session configuration interface or the native runtime changes settings precedence. Preserve isolation, private-file protection and child-lifetime cleanup in any replacement.

## CLI-003: Account totals and model estimates have different evidence

**Accepted, 2026-10-26.** Native rate-card support began with CLI 0.3.10; reviewed against 0.3.11.

Monthly account spend and allowance reported by the CLI are authoritative account totals. Per-model estimates use the installed native rate card, including short/long input tiers. CLI configuration does not supply an authoritative per-model billing report. Do not label estimates as billed cost or substitute public rates for missing native prices. An unknown pricing tier remains unpriced rather than guessing.

Keep pricing ownership in [ElysiaStats](../../apps/server/src/provider/ElysiaStats.ts) and the existing usage-pricing services. Revisit when a supported native report exposes billed costs by model or new pricing semantics; retain the distinction between observed totals and estimated attribution.

## CLI-004: Uploaded files must remain readable from deployed paths

**Accepted, 2026-10-26.** Baseline: the deployed Elysia home layout and native full-access execution.

Protect application state, secrets and native credentials with specific paths. Do not deny the entire Elysia home: it also contains uploaded files and persistent agent workspaces. That broad deny made composer attachments unreadable while manually copied project files worked. Permit read access to the selected public CA bundle without granting write access or exposing credential stores. Keep TLS verification enabled.

The boundary lives in [ElysiaAgentProtection](../../apps/server/src/provider/ElysiaAgentProtection.ts). Its regression proof must use the real `.elysia/userdata` layout and uploaded text and Office files. Revisit when storage layout or the native sandbox changes; do not solve attachment failures by widening access to all application state.

## UPSTREAM-001: Adapt changes in their current owner

**Accepted, 2026-10-26.** Integration baseline: upstream [`e762f09e26`](https://github.com/pingdotgg/t3code/commit/e762f09e265b31607261ead2b4517c467ff59c28).

Upstream extracts chat, timeline, settings and pull-request behavior into smaller owners. Adopt those ownership boundaries while preserving Elysia's established UI, package names and disabled connection policy. Carrying the old component alongside its replacement creates competing listeners, renderers and state ownership; choosing an entire side of a conflict loses either upstream fixes or fork behavior.

Review the combined behavior, including rightclick and ellipsis entry points, rather than treating a resolved merge marker as proof. Revisit a particular adaptation when upstream changes its boundary again. A useful upstream UI improvement needs an explicit fit assessment against Elysia's design before changing the visible surface.

## UPSTREAM-002: Preserve event and process ownership

**Accepted, 2026-10-26.** Related native decisions: CLI-001, CLI-002 and CLI-004.

Keep orchestration decisions pure and run provider side effects after committed events, through the existing worker and adapter. Adopt upstream lifecycle repairs for [resumed MCP registration](https://github.com/pingdotgg/t3code/commit/572cf74275), [terminal turn settlement](https://github.com/pingdotgg/t3code/commit/725ada6eaa) and [abandoned-turn continuation](https://github.com/pingdotgg/t3code/commit/6f6f68ad2d), while retaining Elysia's dedicated agent/channel conversations. A new UI action must not create a second provider execution path.

The server's exclusive data-directory ownership lock remains authoritative. Upstream's pre-0.1 version heuristic cannot distinguish Elysia's 0.0.x releases from an old runtime without that lock. Detect the actual ownership capability instead of bypassing the lock, deleting its database or stopping an unrelated process. Revisit capability detection when the upstream ownership protocol changes; verify both supported upgrades and genuine competing owners.

## UPSTREAM-003: Existing state and disabled capabilities survive merges

**Accepted, 2026-10-26.** Integration baseline: upstream `e762f09e26`, existing Elysia migration ledger through 73.

Applied migration identities are durable state. Incoming upstream migrations that reuse fork identifiers must receive new trailing identifiers; do not rewrite applied history. Verify repeated startup, preservation of existing content and that deleted content does not return. This protects existing users independently of clean-install tests.

A newly added upstream connection feature must pass the same Elysia policy at the UI, RPC/HTTP admission and service boundaries. Hiding its button alone does not preserve the fork policy. Keep dormant upstream code coherent without enabling it accidentally. Revisit only when the product policy changes, with an explicit decision covering all entry points and clients.
