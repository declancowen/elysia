import { useState } from "react";
import {
  ELYSIA_DISABLE_COMPRESSION_METHOD,
  ELYSIA_ENABLE_COMPRESSION_METHOD,
  ELYSIA_RETRY_COMPRESSION_METHOD,
  isElysiaCompressionMethod,
  type EnvironmentId,
  type ProviderAuthState,
  type ProviderInstanceId,
  type ServerProvider,
} from "@elysiatools/contracts";
import { settlePromise } from "@elysiatools/client-runtime/state/runtime";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { SettingsRow, SettingsSection } from "./settingsLayout";

function compressionPresentation(auth: ProviderAuthState | null | undefined, usingProxy: boolean) {
  const { methods = [], phase, methodId, message } = auth ?? {};
  const retry = methods.find(({ id }) => id === ELYSIA_RETRY_COMPRESSION_METHOD);
  const enable = methods.find(({ id }) => id === ELYSIA_ENABLE_COMPRESSION_METHOD) ?? retry;
  const disable = methods.find(({ id }) => id === ELYSIA_DISABLE_COMPRESSION_METHOD);
  const enabled = Boolean(disable || (!enable && usingProxy));
  const compressionAction = isElysiaCompressionMethod(methodId);
  return {
    actions: [enable, disable].filter((method) => method !== undefined),
    active: ["starting", "waiting", "verifying"].some((activePhase) => phase === activePhase),
    status: retry ? "Paused" : enabled ? "On" : "Off",
    message: compressionAction ? message : null,
    failed: compressionAction && phase === "failed",
  };
}

export function ElysiaCompressionSection({
  environmentId,
  instanceId,
  provider,
  disabled,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider | undefined;
  readonly disabled: boolean;
}) {
  const target = { environmentId, input: { instanceId } };
  const { data: auth } = useEnvironmentQuery(serverEnvironment.providerAuthState(target));
  const start = useAtomCommand(serverEnvironment.startProviderAuth, "Change compression");
  const [pending, setPending] = useState(false);
  const compression = provider?.elysiaCompression;
  const { status, active, actions, message, failed } = compressionPresentation(
    auth,
    compression?.enabled ?? false,
  );
  if (actions.length === 0 && !compression) return null;

  function change(methodId: string) {
    setPending(true);
    void settlePromise(() => start({ environmentId, input: { instanceId, methodId } })).finally(
      () => setPending(false),
    );
  }

  return (
    <SettingsSection title="Compression">
      <SettingsRow
        title="Context compression"
        status={status}
        description={
          <span role={failed ? "alert" : "status"}>
            {message ??
              (status === "On"
                ? "Elysia routes requests through the local compression proxy."
                : "Elysia sends requests directly to the gateway.")}
          </span>
        }
        control={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions.map((method) => (
              <Button
                key={method.id}
                variant="outline"
                size="xs"
                disabled={disabled || pending || active}
                onClick={() => change(method.id)}
              >
                {method.name}
              </Button>
            ))}
          </div>
        }
      />
    </SettingsSection>
  );
}
