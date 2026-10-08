import {
  type OrchestrationV2Actor,
  type OrchestrationV2RunStatus,
  type OrchestrationV2UserMessageInputIntent,
  ScheduledTaskId,
} from "@elysiatools/contracts";

/** Queue provenance survives delivery; only a live queued run is still queued. */
export function resolveUserMessageIntentMarker(
  intent: OrchestrationV2UserMessageInputIntent | undefined,
  runStatus: OrchestrationV2RunStatus | undefined,
) {
  if (intent === "queued_turn") return runStatus === "queued" ? intent : null;
  return intent === "steer" || intent === "promoted_queued_to_steer" ? intent : null;
}

const LEGACY_AUTOMATION_PREFIX = /^\[Triggered by schedule task: [^\r\n]+\]\r?\n\r?\n/;
const LEGACY_AUTOMATION_MESSAGE_ID = /^scheduled-task-message:(.+):\d+:(?:scheduled|manual)$/;

/** Older scheduled messages stored their attribution in the prompt itself. */
export function resolveUserMessagePresentation(message: {
  readonly id?: string;
  readonly role: string;
  readonly text: string;
  readonly createdBy?: OrchestrationV2Actor;
  readonly scheduledTaskId?: ScheduledTaskId;
}) {
  if (message.role !== "user") {
    return { text: message.text, isAutomation: false, scheduledTaskId: undefined };
  }
  if (message.scheduledTaskId !== undefined) {
    return { text: message.text, isAutomation: true, scheduledTaskId: message.scheduledTaskId };
  }
  const legacyPrefix = LEGACY_AUTOMATION_PREFIX.exec(message.text);
  const legacyTaskId = legacyPrefix
    ? LEGACY_AUTOMATION_MESSAGE_ID.exec(message.id ?? "")?.[1]
    : undefined;
  const isAutomation =
    legacyPrefix !== null && (legacyTaskId !== undefined || message.createdBy === "agent");
  return {
    text: isAutomation ? message.text.slice(legacyPrefix[0].length) : message.text,
    isAutomation,
    scheduledTaskId: legacyTaskId === undefined ? undefined : ScheduledTaskId.make(legacyTaskId),
  };
}
