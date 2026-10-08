# Install Elysia

Download the official installer from [Elysia releases](https://github.com/declancowen/elysia/releases/latest).
Choose the macOS `.dmg` or Windows `.exe` that matches your machine's architecture.

Open Elysia after installation and configure your provider in **Settings → Providers**.
Provider authentication belongs to the machine running Elysia.

## Source development

To run the development app from this repository:

```sh
vp i
vp run dev
```

Open the development URL printed by the runner. Development uses isolated state
inside the checkout; it does not replace the installed application.

Elysia currently publishes macOS and Windows desktop installers. Standalone CLI,
Linux package-manager and mobile store installation links are not available from
this release channel.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from a phone or another
computer.

| Provider    | Install and authenticate                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | [Connect with ChatGPT](./providers-codex.md#connect-with-chatgpt), or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. |
| Claude      | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`.                                                              |
| Cursor      | Install [Cursor CLI](https://cursor.com/cli), then run `agent login`.                                                                                     |
| Grok Build  | Install [Grok Build CLI](https://x.ai/cli), then run `grok login`.                                                                                        |
| OpenCode    | Install [OpenCode](https://opencode.ai), then run `opencode auth login`.                                                                                  |
| Antigravity | Install and sign in with Google from Elysia's provider settings.                                                                                          |
| Pi          | Install [Pi](https://pi.dev), then run `pi` once to finish its login or API-key setup.                                                                    |

Provider CLIs must be on the server's `PATH`. If Elysia cannot find one, set its
**Binary path** in provider settings, especially when using a version manager.
Cursor's executable is `cursor-agent`, although its login command is
`agent login`. Codex connected through ChatGPT and Antigravity can use their
managed runtimes without a `PATH` entry.

Elysia warns when a provider version has known compatibility problems with your
release. Check **Settings → Providers** on that environment for the recommended
version or range. When its package manager supports installing a specific version,
you can install the recommendation there. Otherwise use the provider's installer
on the environment's machine. An unlisted version is unverified.

When a provider CLI is behind its latest release, its provider card shows the
available version. **Update now** runs the installer that owns the CLI
(Homebrew, or a global npm, pnpm, Yarn, Bun, Volta, or Vite+ install), or the
CLI's own update command when Elysia cannot tell. Update a CLI installed with
mise through mise. Cursor and Antigravity update with Elysia. Homebrew installs
compare against the version Homebrew offers, which can trail the npm release by
a few hours.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive; after saving, Elysia does not display
their original values.

For provider-specific setup and accounts, see [Codex](./providers-codex.md),
[Claude](./providers-claude.md), [OpenCode](./providers-opencode.md),
[Antigravity](./providers-antigravity.md), and [Pi](./providers-pi.md).
