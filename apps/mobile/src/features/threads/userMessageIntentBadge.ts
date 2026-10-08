import type {
  OrchestrationV2UserMessageInputIntent,
  OrchestrationV2RunStatus,
} from "@elysiatools/contracts";
import { resolveUserMessageIntentMarker } from "@elysiatools/client-runtime/user-message";

export interface UserMessageIntentBadgePresentation {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly tone: "queued" | "steer";
}

export function resolveUserMessageIntentBadge(
  intent: OrchestrationV2UserMessageInputIntent | undefined,
  runStatus?: OrchestrationV2RunStatus,
): UserMessageIntentBadgePresentation | null {
  switch (resolveUserMessageIntentMarker(intent, runStatus)) {
    case "queued_turn":
      return {
        label: "queued",
        accessibilityLabel: "Queued behind the active turn",
        tone: "queued",
      };
    case "steer":
      return {
        label: "steer",
        accessibilityLabel: "Steered the active turn",
        tone: "steer",
      };
    case "promoted_queued_to_steer":
      return {
        label: "queued → steer",
        accessibilityLabel: "Originally queued, then promoted to steer the active turn",
        tone: "steer",
      };
    case null:
      return null;
  }
}
