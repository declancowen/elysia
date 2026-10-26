# Claude Code through Elysia

Elysia uses the company Elysia CLI to configure and run Claude Code. Open **Settings → Providers** to install the prerequisites, connect, or update the managed CLI.

## Reuse your existing sign-in

If the CLI is already signed in from your terminal, Elysia imports and reuses that native sign-in. Enter company credentials only when the CLI reports that they are needed. The CLI owns credential validation, certificate trust and network requirements on both macOS and Windows.

Elysia does not require a separate Claude subscription login or a second account setup. Optional plugin installation problems do not invalidate a working native sign-in.

## Models and context

Choose an available model in the thread composer, or change the default for new threads in provider settings. Existing threads retain their selected model. The native CLI owns the available roster; the app does not reintroduce retired models or maintain a separate provider list.

The CLI’s `elysia-code --config` output is the account/configuration reference. CLI 0.3.10 and later show model-specific context length, auto-compact window and token rates. Initialization, CLI updates and model switches maintain those values. Older configurations may show `not set` until the CLI refreshes them.

You can send `/compact` in an existing conversation. The CLI and Claude Code own the compaction behavior and configured context limits.

## Updates

Use the Elysia CLI updater in **Settings → Providers** to update the managed copy used by app sessions. Updating a separate global CLI does not update the app’s managed copy. A successful update applies its configuration to a fresh process on the next user turn; finish or stop running work before replacing its process.

## Usage

The account totals reported by the native CLI are authoritative for spend, allowance and reset period. Stats also shows model-level estimates from recorded activity and known rates. Input/output token rates in `--config` are pricing metadata, not an itemized statement of billed cost per model.

## Skills and commands

Claude skills come from the CLI-configured settings and the project’s `.claude/skills` directory. Enabled native plugins can contribute namespaced skills. Use the composer’s skill picker and slash menu for the commands available to that session; Elysia leaves managed `elysia-*` commands under the CLI’s ownership.
