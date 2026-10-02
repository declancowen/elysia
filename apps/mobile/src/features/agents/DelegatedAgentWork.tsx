import type { AgentGetDelegationResult, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { isAgentDelegationActive, type DelegatedAgent } from "@t3tools/shared/agentMentions";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/AppText";
import { useProject, useThreadShell } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentQuery } from "../../state/query";
import { AgentAvatar } from "./AgentAvatar";
import {
  delegatedAgentStatusLabel,
  delegatedAgentsStatusLabel,
  delegationShellRevision,
  delegationShellRevisionToRefresh,
} from "./delegatedAgentWork.logic";

function useDelegatedWork(
  environmentId: EnvironmentId,
  sourceThreadId: ThreadId,
  delegation: DelegatedAgent,
) {
  const { data, error, isPending, refresh } = useEnvironmentQuery(
    projectEnvironment.getAgentDelegation({
      environmentId,
      input: { sourceThreadId, activityId: delegation.activityId },
    }),
  );
  const shell = useThreadShell({ environmentId, threadId: delegation.agentThreadId });
  const revision = delegationShellRevision(shell);
  const observedRevision = useRef(revision);
  const status = data?.status ?? null;
  // The shared atom may retain an active result while this source chat is closed.
  const cachedActiveOnMount = useRef(
    status !== null && isAgentDelegationActive(status) && !isPending,
  );
  useEffect(() => {
    if (
      delegationShellRevisionToRefresh({
        previousRevision: observedRevision.current,
        currentRevision: revision,
        status,
        pending: isPending,
        cachedActiveOnMount: cachedActiveOnMount.current,
      })
    ) {
      observedRevision.current = revision;
      cachedActiveOnMount.current = false;
      refresh();
    }
  }, [revision, status, isPending, refresh]);
  return { data, error, isPending, refresh };
}

function DelegatedAvatar(props: {
  environmentId: EnvironmentId;
  sourceThreadId: ThreadId;
  delegation: DelegatedAgent;
  onStatus: (activityId: string, status: AgentGetDelegationResult["status"]) => void;
  single: boolean;
}) {
  const project = useProject({
    environmentId: props.environmentId,
    projectId: props.delegation.agentProjectId,
  });
  const result = useDelegatedWork(props.environmentId, props.sourceThreadId, props.delegation);
  const status = result.data?.status ?? (result.error ? "unavailable" : "queued");
  const { onStatus } = props;
  const activityId = props.delegation.activityId;
  useEffect(() => onStatus(activityId, status), [onStatus, activityId, status]);
  const name = project?.title ?? props.delegation.agentName;
  return (
    <View className="flex-row items-center gap-2">
      <AgentAvatar
        avatar={project?.agentProfile?.avatar ?? { preset: "circle", color: "#28B4FF" }}
        size={22}
        working={isAgentDelegationActive(status)}
      />
      {props.single ? (
        <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
          {name}{" "}
          <Text className="text-foreground-muted">· {delegatedAgentStatusLabel(status)}</Text>
        </Text>
      ) : null}
    </View>
  );
}

export function AgentDelegationResponseSheet(props: {
  environmentId: EnvironmentId;
  sourceThreadId: ThreadId;
  delegation: DelegatedAgent;
  onClose: () => void;
}) {
  const result = useDelegatedWork(props.environmentId, props.sourceThreadId, props.delegation);
  const project = useProject({
    environmentId: props.environmentId,
    projectId: props.delegation.agentProjectId,
  });
  const insets = useSafeAreaInsets();
  const status = result.data?.status ?? "queued";
  return (
    <Modal
      animationType="slide"
      presentationStyle={Platform.OS === "android" ? "overFullScreen" : "pageSheet"}
      transparent={Platform.OS === "android"}
      onRequestClose={props.onClose}
    >
      <View className={Platform.OS === "android" ? "flex-1 justify-end bg-backdrop" : "flex-1"}>
        {Platform.OS === "android" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close agent response"
            onPress={props.onClose}
            className="absolute inset-0"
          />
        ) : null}
        <View
          className="min-h-0 flex-1 overflow-hidden rounded-t-3xl bg-sheet-solid"
          style={Platform.OS === "android" ? { marginTop: insets.top + 24 } : undefined}
        >
          <View className="flex-row items-center gap-3 border-b border-border px-4 pb-2 pt-4">
            <AgentAvatar
              avatar={project?.agentProfile?.avatar ?? { preset: "circle", color: "#28B4FF" }}
              size={30}
              working={isAgentDelegationActive(status)}
            />
            <View className="min-w-0 flex-1">
              <Text className="font-t3-semibold text-base text-foreground" numberOfLines={2}>
                {project?.title ?? props.delegation.agentName}
              </Text>
              <Text className="text-xs text-foreground-muted">
                {delegatedAgentStatusLabel(status)} · Delegated response
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close agent response"
              onPress={props.onClose}
              className="p-3"
            >
              <Text className="text-foreground">Done</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingBottom: Math.max(20, insets.bottom),
              gap: 16,
            }}
          >
            {result.data?.truncated ? (
              <Text className="text-xs text-foreground-muted">
                Showing the latest 32 responses for this task.
              </Text>
            ) : null}
            {result.error ? (
              <>
                <Text className="text-danger">{result.error}</Text>
                <Pressable accessibilityRole="button" onPress={result.refresh}>
                  <Text className="text-primary-text">Retry</Text>
                </Pressable>
              </>
            ) : result.data?.messages.length ? (
              result.data.messages.map((message) => (
                <Text key={message.id} selectable className="text-base text-foreground">
                  {message.text}
                </Text>
              ))
            ) : (
              <Text className="text-foreground-muted">
                {result.isPending
                  ? "Loading response…"
                  : isAgentDelegationActive(status)
                    ? "The agent has received this task. Its response will appear here."
                    : "No response is available for this task."}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function DelegatedAgentWork(props: {
  environmentId: EnvironmentId;
  sourceThreadId: ThreadId;
  delegations: ReadonlyArray<DelegatedAgent>;
}) {
  const [selected, setSelected] = useState<DelegatedAgent | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AgentGetDelegationResult["status"]>>({});
  const onStatus = useCallback(
    (id: string, status: AgentGetDelegationResult["status"]) =>
      setStatuses((current) => (current[id] === status ? current : { ...current, [id]: status })),
    [],
  );
  const single = props.delegations.length === 1;
  return (
    <View className="mb-3 gap-2 px-1 py-1">
      <View className="flex-row items-center gap-2">
        {props.delegations.map((delegation) => (
          <Pressable
            key={delegation.activityId}
            accessibilityRole="button"
            accessibilityLabel={`View ${delegation.agentName}'s delegated response`}
            className={single ? "min-w-0 flex-1" : undefined}
            onPress={() => setSelected(delegation)}
          >
            <DelegatedAvatar
              {...props}
              delegation={delegation}
              single={single}
              onStatus={onStatus}
            />
          </Pressable>
        ))}
        {!single ? (
          <Text className="text-sm text-foreground-muted">
            {delegatedAgentsStatusLabel(
              props.delegations.map((delegation) => statuses[delegation.activityId] ?? "queued"),
            )}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <AgentDelegationResponseSheet
          environmentId={props.environmentId}
          sourceThreadId={props.sourceThreadId}
          delegation={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </View>
  );
}
