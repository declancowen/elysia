import { useState } from "react";
import {
  isElysiaCompressionMethod,
  resolveElysiaCompressionControl,
  type EnvironmentId,
  type ProviderAuthState,
  type ProviderInstanceId,
  type ServerProvider,
} from "@elysiatools/contracts";
import { settlePromise } from "@elysiatools/client-runtime/state/runtime";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";

function compressionPresentation(auth: ProviderAuthState | null | undefined, usingProxy: boolean) {
  const { methods = [], phase, methodId, message } = auth ?? {};
  const compressionAction = isElysiaCompressionMethod(methodId);
  return {
    ...resolveElysiaCompressionControl(methods, usingProxy),
    active: ["starting", "waiting", "verifying"].some((activePhase) => phase === activePhase),
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
  const { status, active, enabled, methodId, message, failed } = compressionPresentation(
    auth,
    compression?.enabled ?? false,
  );
  if (!methodId && !compression) return null;

  function change() {
    if (!methodId) return;
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
          <Switch
            aria-label="Context compression"
            aria-busy={pending || active}
            checked={enabled}
            disabled={disabled || pending || active || !methodId}
            onCheckedChange={change}
          />
        }
      />
    </SettingsSection>
  );
}
