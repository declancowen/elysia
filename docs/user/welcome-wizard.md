# Set up Elysia

Elysia opens a setup flow on a new installation. Choose **Set up Elysia**. Setup checks Node.js 18+ and Python 3.11+, installs Claude Code if needed, and prepares the native Elysia package. Missing Node.js or Python can be installed through Homebrew on macOS or winget on Windows; if that package manager is unavailable, install the prerequisite and retry.

In **Settings → Providers**, choose **Set up Elysia** and enter your company workspace ID, config ID, user ID and API key. The key is masked. Setup runs the native Elysia initialisation and enables context compression automatically. Connect to the company network or VPN if the gateway requires it.

If the package is installed elsewhere, set its Python script path and Python executable in the provider settings.

Set **Default model** in Providers for new threads and the managed CLI. Existing threads keep their selected model. Select a gateway model in the composer. Models that support it offer an **Intelligence** control. Start a new thread to change models after a session has started.

The company build uses Elysia exclusively. Other provider runtimes and Connections are disabled.

To view savings, open **Stats** or type `/elysia-compression stats` inside Claude Code. The default compression dashboard is `http://localhost:8787/dashboard`; Stats displays the native dashboard using its active local port.
