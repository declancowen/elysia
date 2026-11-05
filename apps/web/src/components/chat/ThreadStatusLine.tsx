import type { ReactNode } from "react";

import { InlineButton } from "../ui/button";

export function ThreadStatusLine(props: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly actionLabel: string;
  readonly actionDisabled?: boolean;
  readonly onAction: () => void;
  // Set for clock-dependent labels to trigger updates.
  readonly clockMinute?: string;
}) {
  return (
    <div
      data-chat-thread-status-line="true"
      className="flex min-w-0 shrink-0 items-center gap-1.5 px-2 text-muted-foreground text-xs [&_svg]:size-3.5 [&_svg]:shrink-0"
    >
      {props.icon}
      <span className="min-w-0 truncate">{props.label}</span>
      <span aria-hidden="true">·</span>
      <InlineButton disabled={props.actionDisabled} onClick={props.onAction}>
        {props.actionLabel}
      </InlineButton>
    </div>
  );
}
