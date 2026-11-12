import { DownloadIcon } from "~/icons";
import { ClaudeAI } from "./Icons";
import { ProviderInstanceIcon } from "./chat/ProviderInstanceIcon";
import type { ProviderUpdateSnapshot } from "./ProviderUpdateLaunchNotification.logic";

export function ProviderUpdateToastIcon({
  providers,
}: {
  providers: readonly ProviderUpdateSnapshot[];
}) {
  const provider = providers[0];
  if (
    !provider ||
    providers.some(
      (candidate) =>
        candidate.driver !== provider.driver || candidate.updateTarget !== provider.updateTarget,
    )
  ) {
    return <DownloadIcon aria-hidden="true" className="size-4" />;
  }

  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      {provider.updateTarget === "runtime" ? (
        <ClaudeAI className="size-4" aria-hidden="true" />
      ) : (
        <ProviderInstanceIcon
          driverKind={provider.driver}
          displayName={provider.displayName ?? provider.driver}
          acpRegistryIconUrl={provider.iconUrl}
          iconClassName="size-4"
        />
      )}
      <span className="absolute -right-1 -bottom-1 z-40 inline-flex size-3 items-center justify-center rounded-full bg-popover">
        <DownloadIcon aria-hidden="true" className="size-2.5" strokeWidth={2.5} />
      </span>
    </span>
  );
}
