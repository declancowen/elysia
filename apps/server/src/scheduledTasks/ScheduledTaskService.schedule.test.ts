import * as Option from "effect/Option";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as AgentDelegation from "../orchestration-v2/AgentDelegation.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { ProjectId, ScheduledTaskUpsertInput, ThreadId } from "@elysiatools/contracts";
import { formatAgentMention } from "@elysiatools/shared/agentMentions";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import * as ThreadLaunchService from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ScheduledTaskService from "./ScheduledTaskService.ts";

const decodeUpsertInput = Schema.decodeUnknownEffect(ScheduledTaskUpsertInput);
const decodeProject = Schema.decodeUnknownEffect(ProjectStore.ProjectRow);

const projectInput = {
  projectId: "project-scheduled-routing",
  title: "Release",
  workspaceRoot: "/projects/release",
  defaultModelSelection: null,
  defaultThreadEnvMode: null,
  autoPull: false,
  faviconPath: null,
  projectIcon: null,
  scripts: [],
  createdAt: "2026-10-03T00:00:00Z",
  updatedAt: "2026-10-03T00:00:00Z",
  deletedAt: null,
};

const scheduleInput = {
  title: "Release review",
  prompt: "Review the release",
  enabled: false,
  schedule: { type: "interval", everyMs: 60_000 },
  projectId: projectInput.projectId,
  workspaceStrategy: { type: "root" },
  modelSelection: { instanceId: "elysia", model: "selected-model" },
  runtimeMode: "full-access",
  interactionMode: "default",
};

const agentProfileInput = {
  instructions: "Review releases",
  avatar: { preset: "circle", color: "#28B4FF" },
  archived: false,
  notificationsEnabled: true,
  conversationThreadId: "agent-chat",
};

it.effect("rejects a stale form save after deletion while preserving explicit-id creates", () =>
  Effect.gen(function* () {
    const layerDependencies = Layer.mergeAll(
      NodeCrypto.layer,
      Scheduler.layer,
      Layer.mock(ThreadLaunchService.ThreadLaunchService)({}),
      Layer.mock(ThreadManagementService.ThreadManagementService)({}),
      Layer.mock(ProjectStore.ProjectStoreV2)({ get: () => Effect.succeed(Option.none()) }),
      Layer.mock(AgentDelegation.AgentDelegation)({}),
      Layer.mock(SecretRequests.SecretRequests)({}),
    );
    yield* Effect.gen(function* () {
      const service = yield* ScheduledTaskService.ScheduledTaskService;
      const input = yield* decodeUpsertInput({
        id: "scheduled-task:edit-after-delete",
        title: "Review",
        prompt: "Review the open pull requests.",
        enabled: true,
        schedule: { type: "interval", everyMs: 60_000 },
        projectId: "project-stale-schedule",
        workspaceStrategy: { type: "root" },
        modelSelection: { instanceId: "codex", model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
      });
      const created = yield* service.upsert(input);
      const edit = yield* decodeUpsertInput({ ...input, requireExisting: true, title: "Edited" });
      expect((yield* service.upsert(edit)).task.title).toBe("Edited");
      yield* service.delete({ id: created.task.id });

      const failure = yield* service.upsert(edit).pipe(Effect.flip);
      expect(failure.message).toBe("Schedule task not found.");
      expect((yield* service.list()).tasks).toEqual([]);

      expect((yield* service.upsert(input)).task.id).toBe(created.task.id);
    }).pipe(Effect.provide(ScheduledTaskService.layer.pipe(Layer.provide(layerDependencies))));
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("preserves a due run when a save only pads the scheduled hour", () =>
  Effect.gen(function* () {
    const dueAt = DateTime.makeZonedUnsafe(
      { year: 2026, month: 7, day: 1, hour: 9, minute: 0, second: 0, millisecond: 0 },
      { timeZone: DateTime.zoneMakeLocal(), adjustForTimeZone: true },
    );
    yield* TestClock.setTime(DateTime.toEpochMillis(dueAt) - 1_000);

    const layerDependencies = Layer.mergeAll(
      NodeCrypto.layer,
      Scheduler.layer,
      Layer.mock(ThreadLaunchService.ThreadLaunchService)({}),
      Layer.mock(ThreadManagementService.ThreadManagementService)({}),
      Layer.mock(ProjectStore.ProjectStoreV2)({ get: () => Effect.succeed(Option.none()) }),
      Layer.mock(AgentDelegation.AgentDelegation)({}),
      Layer.mock(SecretRequests.SecretRequests)({}),
    );
    yield* Effect.gen(function* () {
      const service = yield* ScheduledTaskService.ScheduledTaskService;
      const input = yield* decodeUpsertInput({
        commandId: "schedule-time-format",
        title: "Morning review",
        prompt: "Review the open pull requests.",
        enabled: true,
        schedule: { type: "fixed_time", timeOfDay: "9:00" },
        projectId: "project-schedule-time-format",
        workspaceStrategy: { type: "root" },
        modelSelection: { instanceId: "codex", model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        creationSource: "mcp",
      });
      const created = yield* service.upsert(input);
      const expectedDueAt = DateTime.formatIso(DateTime.toUtc(dueAt));
      expect(created.task.nextRunAt).toBe(expectedDueAt);

      // Cross the due time before the scheduler's first five-second tick.
      yield* TestClock.setTime(DateTime.toEpochMillis(dueAt) + 1_000);
      const update = yield* decodeUpsertInput({
        ...input,
        id: created.task.id,
        schedule: { type: "fixed_time", timeOfDay: "09:00" },
      });
      const updated = yield* service.upsert(update);
      expect(updated.task.nextRunAt).toBe(expectedDueAt);
      expect((yield* service.list()).tasks[0]?.nextRunAt).toBe(expectedDueAt);

      const rescheduled = yield* service.upsert({
        ...update,
        schedule: { type: "fixed_time", timeOfDay: "09:30" },
      });
      expect(rescheduled.task.nextRunAt).toBe(
        DateTime.formatIso(DateTime.toUtc(DateTime.add(dueAt, { minutes: 30 }))),
      );
    }).pipe(Effect.provide(ScheduledTaskService.layer.pipe(Layer.provide(layerDependencies))));
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("routes channel schedules through the current dedicated chat and selected member", () =>
  Effect.gen(function* () {
    const channel = yield* decodeProject({
      ...projectInput,
      projectId: "channel",
      agentProfile: {
        ...agentProfileInput,
        conversationThreadId: "channel-chat",
        group: { memberProjectIds: ["lead", "designer"], leadProjectId: "lead" },
      },
    });
    const lead = yield* decodeProject({
      ...projectInput,
      projectId: "lead",
      title: "Alfred",
      agentProfile: {
        ...agentProfileInput,
        conversationThreadId: "lead-chat",
      },
    });
    const designer = yield* decodeProject({
      ...lead,
      projectId: "designer",
      title: "Designer",
      agentProfile: { ...agentProfileInput, conversationThreadId: "designer-chat" },
    });
    const calls: import("@elysiatools/contracts").AgentDelegateInput[] = [];
    let channelThreadId: ThreadId | undefined = ThreadId.make("channel-chat");
    let channelArchived = false;
    let leadArchived = false;
    let designerArchived = false;
    let leadMissing = false;
    const dependencies = Layer.mergeAll(
      NodeCrypto.layer,
      Scheduler.layer,
      Layer.mock(SecretRequests.SecretRequests)({}),
      Layer.mock(ThreadLaunchService.ThreadLaunchService)({}),
      Layer.mock(ThreadManagementService.ThreadManagementService)({}),
      Layer.mock(ProjectStore.ProjectStoreV2)({
        get: (id) => {
          if (id === "lead" && leadMissing) return Effect.succeedNone;
          const project = id === "channel" ? channel : id === "lead" ? lead : designer;
          return Effect.succeed(
            Option.some({
              ...project,
              agentProfile: {
                ...project.agentProfile!,
                conversationThreadId:
                  id === "channel" ? channelThreadId : project.agentProfile!.conversationThreadId,
                archived:
                  id === "channel"
                    ? channelArchived
                    : id === "lead"
                      ? leadArchived
                      : designerArchived,
              },
            }),
          );
        },
      }),
      Layer.mock(AgentDelegation.AgentDelegation)({
        delegate: (input) => {
          calls.push(input);
          const member = input.agentProjectId === "lead" ? lead : designer;
          return Effect.succeed({
            projectId: member.projectId,
            threadId: member.agentProfile!.conversationThreadId!,
          });
        },
      }),
    );
    yield* Effect.gen(function* () {
      const service = yield* ScheduledTaskService.ScheduledTaskService;
      const input = yield* decodeUpsertInput({
        title: "Release review",
        prompt: "Ask the designer to review",
        enabled: false,
        schedule: { type: "interval", everyMs: 60000 },
        projectId: "channel",
        threadId: null,
        workspaceStrategy: { type: "root" },
        modelSelection: { instanceId: "elysia", model: "old-model" },
        runtimeMode: "full-access",
        interactionMode: "default",
      });
      const task = (yield* service.upsert(input)).task;
      const result = yield* service.runNow({ id: task.id });
      expect(result.task.lastRunStatus).toBe("succeeded");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.sourceThreadId).toBe("channel-chat");
      expect(calls[0]?.agentProjectId).toBe("lead");
      expect(calls[0]?.text).toBe(input.prompt);
      expect(calls[0]).not.toHaveProperty("modelSelection");

      const taggedPrompt = `Review the release ${formatAgentMention(ProjectId.make("designer"), "Designer")}`;
      channelThreadId = ThreadId.make("channel-chat-latest");
      yield* service.upsert({
        ...input,
        id: task.id,
        threadId: ThreadId.make("stale-chat"),
        prompt: taggedPrompt,
      });
      yield* TestClock.adjust(1);
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("succeeded");
      expect(calls).toHaveLength(2);
      expect(calls[1]?.sourceThreadId).toBe("channel-chat-latest");
      expect(calls[1]?.agentProjectId).toBe("designer");
      expect(calls[1]?.text).toBe(taggedPrompt);

      channelArchived = true;
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
      channelArchived = false;
      channelThreadId = undefined;
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
      channelThreadId = ThreadId.make("channel-chat-latest");
      designerArchived = true;
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
      designerArchived = false;

      yield* service.upsert({ ...input, id: task.id });
      leadArchived = true;
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
      leadArchived = false;
      leadMissing = true;
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
      leadMissing = false;
      yield* service.upsert({
        ...input,
        id: task.id,
        prompt: formatAgentMention(ProjectId.make("outsider"), "Outsider"),
      });
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
      expect(calls).toHaveLength(2);
    }).pipe(Effect.provide(ScheduledTaskService.layer.pipe(Layer.provide(dependencies))));
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("uses the current agent conversation and preserves the schedule's model override", () =>
  Effect.gen(function* () {
    let project = yield* decodeProject({ ...projectInput, agentProfile: agentProfileInput });
    const calls: ThreadManagementService.ThreadManagementSendInput[] = [];
    let launches = 0;
    const dependencies = Layer.mergeAll(
      NodeCrypto.layer,
      Scheduler.layer,
      Layer.mock(SecretRequests.SecretRequests)({}),
      Layer.mock(AgentDelegation.AgentDelegation)({}),
      Layer.mock(ProjectStore.ProjectStoreV2)({ get: () => Effect.succeedSome(project) }),
      Layer.mock(ThreadLaunchService.ThreadLaunchService)({
        launch: () => {
          launches += 1;
          return Effect.die(new Error("Agent schedules must not create threads"));
        },
      }),
      Layer.mock(ThreadManagementService.ThreadManagementService)({
        sendToThread: (input) => {
          calls.push(input);
          // The schedule records dispatch success without reading the returned thread projection.
          return Effect.succeed({ delivery: "queued" } as never);
        },
      }),
    );
    yield* Effect.gen(function* () {
      const service = yield* ScheduledTaskService.ScheduledTaskService;
      const input = yield* decodeUpsertInput({ ...scheduleInput, threadId: null });
      const task = (yield* service.upsert(input)).task;
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("succeeded");
      expect(calls[0]?.threadId).toBe("agent-chat");
      expect(calls[0]?.modelSelection).toEqual(input.modelSelection);
      expect(calls[0]?.scheduledTaskId).toBe(task.id);
      expect(calls[0]?.mode).toBe("queue");

      project = yield* decodeProject({
        ...project,
        agentProfile: { ...agentProfileInput, conversationThreadId: "agent-chat-latest" },
      });
      yield* service.upsert({ ...input, id: task.id, threadId: ThreadId.make("stale-chat") });
      yield* TestClock.adjust(1);
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("succeeded");
      expect(calls[1]?.threadId).toBe("agent-chat-latest");
      expect(calls[1]?.modelSelection).toEqual(input.modelSelection);

      for (const agentProfile of [
        { ...agentProfileInput, archived: true },
        { ...agentProfileInput, conversationThreadId: undefined },
      ]) {
        project = yield* decodeProject({ ...project, agentProfile });
        expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
      }
      project = yield* decodeProject({
        ...project,
        agentProfile: agentProfileInput,
        deletedAt: "2026-10-08T00:00:00Z",
      });
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
      expect(calls).toHaveLength(2);
      expect(launches).toBe(0);
    }).pipe(Effect.provide(ScheduledTaskService.layer.pipe(Layer.provide(dependencies))));
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("launches project runs separately and preserves explicitly targeted legacy threads", () =>
  Effect.gen(function* () {
    const project = yield* decodeProject(projectInput);
    const launches: ThreadLaunchService.ThreadLaunchInput[] = [];
    const sends: ThreadManagementService.ThreadManagementSendInput[] = [];
    const dependencies = Layer.mergeAll(
      NodeCrypto.layer,
      Scheduler.layer,
      Layer.mock(SecretRequests.SecretRequests)({}),
      Layer.mock(AgentDelegation.AgentDelegation)({}),
      Layer.mock(ProjectStore.ProjectStoreV2)({ get: () => Effect.succeedSome(project) }),
      Layer.mock(ThreadLaunchService.ThreadLaunchService)({
        launch: (input) => {
          launches.push(input);
          return Effect.succeed({ threadId: `run-${launches.length}`, resumed: false } as never);
        },
      }),
      Layer.mock(ThreadManagementService.ThreadManagementService)({
        sendToThread: (input) => {
          sends.push(input);
          return Effect.succeed({ delivery: "queued" } as never);
        },
      }),
    );
    yield* Effect.gen(function* () {
      const service = yield* ScheduledTaskService.ScheduledTaskService;
      const input = yield* decodeUpsertInput({ ...scheduleInput, threadId: null });
      const task = (yield* service.upsert(input)).task;
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("succeeded");
      yield* TestClock.adjust(1);
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("succeeded");
      expect(launches).toHaveLength(2);
      expect(launches[0]?.threadId).toBeUndefined();
      expect(launches[1]?.threadId).toBeUndefined();
      expect(launches[0]?.commandId).not.toBe(launches[1]?.commandId);
      expect(launches[0]?.initialMessage?.scheduledTaskId).toBe(task.id);
      expect(launches[0]?.modelSelection).toEqual(input.modelSelection);
      expect(sends).toHaveLength(0);

      yield* service.upsert({ ...input, id: task.id, threadId: ThreadId.make("legacy-target") });
      yield* TestClock.adjust(1);
      expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("succeeded");
      expect(launches).toHaveLength(2);
      expect(sends).toHaveLength(1);
      expect(sends[0]?.threadId).toBe("legacy-target");
      expect(sends[0]?.modelSelection).toEqual(input.modelSelection);
    }).pipe(Effect.provide(ScheduledTaskService.layer.pipe(Layer.provide(dependencies))));
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);
