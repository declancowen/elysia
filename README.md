# Elysia

Elysia is a coding app for company work. It connects to Elysia Code through the Claude Code runtime, with the company gateway's models, credentials and context compression.

## Getting started

On first launch, Elysia reads an existing native CLI setup and validates its credentials, certificates and gateway connection before opening your workspace. Your company VPN/Zscaler must be connected. If setup is missing or invalid, choose **Install and set up Elysia**: it installs missing prerequisites, shows progress, and asks for your company credentials. Setup is required before entering the workspace. You can edit credentials later in **Settings → Providers → Elysia CLI**.

The Elysia CLI and Claude Code runtime have separate update actions in Providers. Other provider integrations and external connections are disabled in this fork.

Choose a model when starting a thread, or set a default in Providers. Models can be reordered and shown or hidden in the picker. You can also start a thread without choosing a project; Elysia creates a separate working folder for it.

View your compression savings with `/elysia-compression stats`, or view the native dashboard inside the Stats page. The dashboard runs locally, normally at `localhost:8787/dashboard`; an additional managed instance may use another local port.

## Building from source

Install [Vite+](https://viteplus.dev/guide/), then run:

```bash
vp i
vp run dev
```

For the desktop development app:

```bash
vp run dev:desktop
```

Build the web and server packages with:

```bash
vp run --filter @t3tools/web build
vp run --filter t3 build
```

Internal package names remain compatible with the upstream repository. Development state is isolated from an installed app. Recent includes threads started without a project.

## Origins and acknowledgements

Elysia is derived from [T3 Code](https://github.com/pingdotgg/t3code), an open-source coding-agent app created by **T3 Tools Inc. and its contributors**. Its client interfaces, server architecture and provider integration framework form the foundation of this fork. We acknowledge their work and the wider open-source projects Elysia depends on.

The original **MIT licence and copyright notice** are preserved in [LICENSE](./LICENSE). Third-party licence notices are retained with the application. Elysia's branding and company-specific integration are maintained in [this fork](https://github.com/declancowen/elysia).
