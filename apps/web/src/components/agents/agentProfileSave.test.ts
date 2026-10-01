import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type AgentProfile,
  type ModelSelection,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { saveAgentProfile } from "./agentProfileSave";

const environmentId = EnvironmentId.make("local");
const projectId = ProjectId.make("agent-project");
const threadId = ThreadId.make("agent-conversation");
const model: ModelSelection = {
  instanceId: ProviderInstanceId.make("elysia"),
  model: "native-model",
};
const profile: AgentProfile = {
  instructions: "Research carefully.",
  title: "Researcher",
  avatar: { preset: "brain", color: "violet" },
  notificationsEnabled: true,
  archived: false,
  conversationThreadId: threadId,
};

function fixture() {
  const thread: Parameters<typeof saveAgentProfile>[0]["threads"][number] = {
    id: threadId,
    environmentId,
    projectId,
    createdAt: "2026-10-01T09:00:00Z",
    archivedAt: null,
    modelSelection: model,
    session: {
      threadId,
      status: "ready",
      providerName: "claudeAgent",
      runtimeMode: "full-access",
      activeTurnId: null,
      lastError: null,
      updatedAt: "2026-10-01T09:00:00Z",
    },
    hasPendingApprovals: false,
    hasPendingUserInput: false,
  };
  const calls: string[] = [];
  return {
    input: {
      project: {
        id: projectId,
        environmentId,
        title: "Alex",
        agentProfile: profile,
        defaultModelSelection: model,
      },
      threads: [thread],
      name: "Alex",
      profile,
      model,
      updateProject: vi.fn(async () => {
        calls.push("profile");
      }),
      updateThreadModel: vi.fn(async () => {
        calls.push("model");
      }),
      stopSession: vi.fn(async () => {
        calls.push("stop");
      }),
    },
    thread,
    calls,
  };
}

describe("saving a persistent agent", () => {
  it("stops its idle native session before updating the stable conversation model", async () => {
    const { input, calls } = fixture();
    input.model = { ...model, model: "another-native-model" };
    await saveAgentProfile(input);
    expect(input.updateThreadModel).toHaveBeenCalledWith(threadId, input.model);
    expect(input.stopSession).toHaveBeenCalledWith(threadId);
    expect(calls).toEqual(["stop", "profile", "model"]);
    expect(input.profile.conversationThreadId).toBe(threadId);
  });

  it.each(["instructions", "name", "role"])(
    "restarts an idle native session when %s change",
    async (field) => {
      const { input } = fixture();
      if (field === "instructions")
        input.profile = { ...profile, instructions: "Focus on sources." };
      if (field === "name") input.name = "Sam";
      if (field === "role") input.profile = { ...profile, title: "Analyst" };
      await saveAgentProfile(input);
      expect(input.updateProject).toHaveBeenCalledOnce();
      expect(input.updateThreadModel).not.toHaveBeenCalled();
      expect(input.stopSession).toHaveBeenCalledOnce();
    },
  );

  it("keeps the native session for avatar and notification-only edits", async () => {
    const { input } = fixture();
    input.profile = {
      ...profile,
      avatar: { preset: "robot", color: "blue" },
      notificationsEnabled: false,
    };
    await saveAgentProfile(input);
    expect(input.updateProject).toHaveBeenCalledOnce();
    expect(input.updateThreadModel).not.toHaveBeenCalled();
    expect(input.stopSession).not.toHaveBeenCalled();
  });

  it.each(["running", "starting", "approval", "input", "monitoring"])(
    "does not interrupt or save over %s work",
    async (condition) => {
      const { input, thread } = fixture();
      input.profile = { ...profile, instructions: "Changed instructions." };
      const busyThread: typeof thread = {
        ...thread,
        ...(condition === "running" || condition === "starting"
          ? { session: { ...thread.session!, status: condition } }
          : {}),
        hasPendingApprovals: condition === "approval",
        hasPendingUserInput: condition === "input",
        ...(condition === "monitoring" ? { backgroundLiveness: "monitoring" as const } : {}),
      };
      await expect(saveAgentProfile({ ...input, threads: [busyThread] })).rejects.toThrow(
        "Wait for the current task to finish",
      );
      expect(input.updateProject).not.toHaveBeenCalled();
      expect(input.updateThreadModel).not.toHaveBeenCalled();
      expect(input.stopSession).not.toHaveBeenCalled();
    },
  );

  it("ignores active work in another environment with the same IDs", async () => {
    const { input, thread } = fixture();
    const foreign = {
      ...thread,
      environmentId: EnvironmentId.make("other"),
      hasPendingUserInput: true,
    };
    await saveAgentProfile({ ...input, threads: [thread, foreign] });
    expect(input.updateProject).toHaveBeenCalledOnce();
    expect(input.stopSession).not.toHaveBeenCalled();
  });

  it("leaves metadata untouched after a failed stop so retry still stops the old native session", async () => {
    const { input, calls } = fixture();
    input.profile = { ...profile, instructions: "Changed instructions." };
    input.model = { ...model, model: "another-native-model" };
    input.stopSession.mockRejectedValueOnce(new Error("Could not stop"));
    await expect(saveAgentProfile(input)).rejects.toThrow("Could not stop");
    expect(input.updateProject).not.toHaveBeenCalled();
    expect(input.updateThreadModel).not.toHaveBeenCalled();
    expect(input.project.agentProfile).toBe(profile);

    await saveAgentProfile(input);
    expect(input.stopSession).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["stop", "profile", "model"]);
  });

  it("keeps the old profile and conversation available to resume when persistence fails after stopping", async () => {
    const { input, thread } = fixture();
    input.profile = { ...profile, instructions: "Changed instructions." };
    input.updateProject.mockRejectedValueOnce(new Error("Disconnected"));
    await expect(saveAgentProfile(input)).rejects.toThrow("Disconnected");
    expect(input.updateThreadModel).not.toHaveBeenCalled();
    expect(input.stopSession).toHaveBeenCalledWith(threadId);
    expect(input.project.agentProfile).toBe(profile);
    expect(input.project.agentProfile.conversationThreadId).toBe(thread.id);
    expect(input.project.defaultModelSelection).toBe(model);

    const stoppedThread: typeof thread = {
      ...thread,
      session: { ...thread.session!, status: "stopped" },
    };
    await saveAgentProfile({ ...input, threads: [stoppedThread] });
    expect(input.stopSession).toHaveBeenCalledOnce();
    expect(input.updateProject).toHaveBeenCalledTimes(2);
  });
});
