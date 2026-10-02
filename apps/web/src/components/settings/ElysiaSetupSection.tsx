import { useEffect, useId, useRef, useState } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import type { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { WizardSteps } from "../ui/wizard";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { toastManager } from "../ui/toast";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";

export function ElysiaSetupSection({
  environmentId,
  instanceId,
  provider,
  readOnly,
  enabled,
  onContinue,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider | undefined;
  readonly readOnly: boolean;
  readonly enabled: boolean;
  readonly onContinue?: (() => void) | undefined;
}) {
  const target = { environmentId, input: { instanceId } };
  const { data: auth } = useEnvironmentQuery(serverEnvironment.providerAuthState(target));
  const start = useAtomCommand(serverEnvironment.startProviderAuth, { reportFailure: false });
  const respond = useAtomCommand(serverEnvironment.respondProviderAuth, { reportFailure: false });
  const cancel = useAtomCommand(serverEnvironment.cancelProviderAuth, { reportFailure: false });
  const logout = useAtomCommand(serverEnvironment.logoutProviderAuth, { reportFailure: false });
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attemptedSetup, setAttemptedSetup] = useState(false);
  const [ignoredFlowId, setIgnoredFlowId] = useState<string | null>(null);
  const [signInRequested, setSignInRequested] = useState(false);
  const credentialsFormId = useId();
  const interaction = auth?.interaction;
  const active =
    auth?.phase === "starting" || auth?.phase === "waiting" || auth?.phase === "verifying";
  const disabled = readOnly || !enabled || pending;
  const alreadyInstalled = Boolean(provider?.version);
  const installationComplete =
    auth?.phase === "waiting" || auth?.phase === "verifying" || auth?.phase === "succeeded";
  const installed = alreadyInstalled || installationComplete;
  const claudeAlreadyInstalled = Boolean(provider?.runtimeVersion);
  const claudeInstalled =
    claudeAlreadyInstalled ||
    installationComplete ||
    (active && auth?.message?.startsWith("4/4") === true);
  const connected = provider?.auth.status === "authenticated" && provider.status === "ready";
  const packagesReady = installed && claudeInstalled;
  const enteringCredentials =
    auth?.phase === "waiting" && interaction?.type === "credentials" && Boolean(auth.flowId);
  const signingIn =
    connected || enteringCredentials || auth?.phase === "verifying" || signInRequested;
  const progress =
    (installed && claudeInstalled) || connected
      ? 100
      : Math.min(100, Math.max(0, Number(auth?.message?.match(/^(\d)\/4/)?.[1] ?? 1) - 1) * 25);
  const reportedFailure = useRef<string | null>(null);
  const connectionError =
    attemptedSetup && auth?.phase === "failed" && auth.flowId !== ignoredFlowId
      ? auth.message
      : null;
  useEffect(() => {
    if (
      !attemptedSetup ||
      auth?.phase !== "failed" ||
      auth.flowId === ignoredFlowId ||
      !auth.message
    )
      return;
    const failure = `${auth.flowId}:${auth.message}`;
    if (reportedFailure.current === failure) return;
    reportedFailure.current = failure;
    toastManager.add({
      type: "error",
      title: "Could not connect Elysia",
      description: auth.message,
    });
  }, [attemptedSetup, ignoredFlowId, auth?.flowId, auth?.message, auth?.phase]);
  async function run(command: () => Promise<AtomCommandResult<unknown, unknown>>) {
    setPending(true);
    setError(null);
    try {
      const result = await command();
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const cause = squashAtomCommandFailure(result);
        const message =
          cause instanceof Error
            ? cause.message
            : "Elysia could not complete the request. Retry setup.";
        setError(message);
        toastManager.add({
          type: "error",
          title: "Could not connect Elysia",
          description: message,
        });
      }
    } catch {
      setError("Elysia could not complete the request. Check the setup status and retry.");
      toastManager.add({
        type: "error",
        title: "Could not connect Elysia",
        description: "Check the setup status and retry.",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={onContinue ? "space-y-3 p-1" : "space-y-4 px-3 py-3 sm:px-4"}>
      {onContinue ? (
        <>
          <WizardSteps steps={["Installation", "Sign in"]} currentStep={signingIn ? 1 : 0} />
          <h2 className="text-xl font-semibold">
            {signingIn ? "Sign in to Elysia" : "Install Elysia"}
          </h2>
        </>
      ) : null}
      {onContinue ? (
        <p className="text-xs text-muted-foreground">
          {connected
            ? "Elysia is connected with native context compression."
            : signingIn
              ? "Enter your company credentials to connect Elysia and enable native context compression."
              : "Check Claude Code and Elysia below. Missing packages are installed automatically when you continue."}
        </p>
      ) : null}
      {auth?.phase === "starting" && !packagesReady ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {installed && claudeInstalled ? <CheckIcon className="size-3.5" /> : null}
              Installation
            </span>
            <span>{progress}%</span>
          </div>
          <progress
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted appearance-none [&::-moz-progress-bar]:bg-foreground [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-foreground"
            max={100}
            value={progress}
            aria-label="Elysia installation progress"
          />
        </div>
      ) : null}
      {onContinue
        ? [true, false].map((installedGroup) => {
            const packages = [
              {
                name: "Claude Code",
                installed: claudeInstalled,
                version: provider?.runtimeVersion,
              },
              { name: "Elysia CLI", installed, version: provider?.version },
            ].filter((item) => item.installed === installedGroup);
            return packages.length > 0 ? (
              <section
                key={String(installedGroup)}
                className="space-y-2"
                aria-label={installedGroup ? "Installed" : "Not installed"}
              >
                <h3 className="text-xs font-semibold">
                  {installedGroup ? "Installed" : "Not installed"}
                </h3>
                {packages.map((item) => (
                  <p
                    key={item.name}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    {item.installed ? <CheckIcon className="size-3.5" aria-hidden="true" /> : null}
                    {item.name}
                    {item.version ? ` (${item.version})` : ""}
                  </p>
                ))}
              </section>
            ) : null;
          })
        : null}
      {!onContinue && connected ? (
        <p role="status" className="text-xs text-muted-foreground">
          Company connection: managed by the Elysia CLI.
        </p>
      ) : null}
      {enteringCredentials && interaction?.type === "credentials" && auth?.flowId ? (
        <form
          id={credentialsFormId}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setAttemptedSetup(true);
            setIgnoredFlowId(null);
            const submitted = values;
            setValues({});
            void run(() =>
              respond({
                environmentId,
                input: {
                  instanceId,
                  flowId: auth.flowId!,
                  interactionId: interaction.id,
                  response: { type: "credentials", values: submitted },
                },
              }),
            );
          }}
        >
          {interaction.fields.map((field) => (
            <label key={field.name} className="flex flex-col gap-1.5 text-xs">
              <span>{field.label}</span>
              <Input
                required
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={field.secret ? "****" : undefined}
                disabled={disabled}
                value={values[field.name] ?? ""}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, [field.name]: event.target.value }))
                }
              />
            </label>
          ))}
        </form>
      ) : null}
      {auth?.phase !== "failed" &&
      auth?.flowId !== ignoredFlowId &&
      (active || attemptedSetup) &&
      auth?.message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {auth.message}
        </p>
      ) : connected ? (
        <p className="text-xs text-muted-foreground">Elysia is connected. API key: ****</p>
      ) : null}
      {error || connectionError ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? connectionError}
        </p>
      ) : null}
      <div className={onContinue ? "flex justify-end gap-3 pt-3" : "flex flex-wrap gap-3"}>
        {active && auth?.flowId ? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setValues({});
              void run(() =>
                cancel({ environmentId, input: { instanceId, flowId: auth.flowId! } }),
              );
            }}
          >
            Cancel setup
          </Button>
        ) : provider?.auth.status === "authenticated" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setValues({});
              void run(() => logout(target));
            }}
          >
            Disconnect Elysia
          </Button>
        ) : null}
        {onContinue && connected ? (
          <Button disabled={disabled} onClick={onContinue}>
            Continue <ArrowRightIcon className="size-3.5" />
          </Button>
        ) : enteringCredentials ? (
          <Button
            form={credentialsFormId}
            type="submit"
            size={onContinue ? "default" : "sm"}
            disabled={disabled}
          >
            Connect
          </Button>
        ) : (
          <Button
            size={onContinue ? "default" : "sm"}
            disabled={disabled || active || !provider}
            onClick={() => {
              setAttemptedSetup(true);
              setIgnoredFlowId(auth?.flowId ?? null);
              setSignInRequested(packagesReady);
              void run(() => start(target));
            }}
          >
            {active
              ? auth?.phase === "verifying"
                ? "Connecting…"
                : packagesReady
                  ? "Continue"
                  : "Installing…"
              : onContinue
                ? "Continue"
                : connected
                  ? "Change credentials"
                  : packagesReady
                    ? "Connect"
                    : "Install"}
            {onContinue && !active ? <ArrowRightIcon className="size-3.5" /> : null}
          </Button>
        )}
      </div>
    </div>
  );
}
