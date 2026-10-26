# Set up Elysia

Elysia opens a setup flow on a new installation. Choose **Set up Elysia**. Setup checks Node.js 18+ and Python 3.11+, installs Claude Code if needed, and prepares the native Elysia package. Missing Node.js or Python can be installed through Homebrew on macOS or winget on Windows; if that package manager is unavailable, install the prerequisite and retry.

If you already signed in through the Elysia CLI in your terminal, setup reuses that native sign-in. Enter company credentials only when the CLI reports that sign-in is required. The CLI owns authentication, certificate trust, network requirements and its saved configuration. Optional plugin installation failures do not invalidate a working sign-in.

If the package is installed elsewhere, set its Python script path and Python executable in the provider settings.

Set **Default model** in Providers for new threads and the managed CLI. Existing threads keep their selected model. Select a gateway model in the composer. Models that support it offer an **Intelligence** control. Model changes apply to the next turn.

The company build uses Elysia exclusively. Other provider runtimes and Connections are disabled.

Open **Stats** to see your CLI account spend, allowance and reset period, alongside compression savings. Account totals are available even when compression is disabled. Use **Refresh** to read the latest totals. Usage history and costs by model are estimates from retained activity, rather than a model-level bill. You can also type `/elysia-compression stats` inside Claude Code to view compression savings.
