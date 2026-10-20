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

Elysia uses the company Elysia CLI with the Claude Code runtime. Open **Settings → Providers** to install or update the prerequisites and connect the CLI.

If you already signed in through the CLI in your terminal, Elysia reuses that native sign-in. Enter credentials only when the CLI reports that sign-in is required. The CLI owns authentication, certificate trust, company network requirements and its saved configuration.

The model list and default model come from the native CLI. Use the Elysia CLI updater in Settings to refresh the managed copy used by app sessions; updating a separate global installation does not update that copy. See [Claude Code through Elysia](./providers-claude.md) for models, context and usage.

Other provider implementations are retained in the source for upstream compatibility. They are not selectable in this Elysia release.

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Updating Elysia](./updating.md): update the installed app.
