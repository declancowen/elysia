import * as Option from "effect/Option";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as AgentDelegation from "../orchestration-v2/AgentDelegation.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { ScheduledTaskUpsertInput } from "@t3tools/contracts";
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

it.effect(
  "runs a folderless channel schedule through its lead with member mentions preserved",
  () =>
    Effect.gen(function* () {
      const decodeProject = Schema.decodeUnknownEffect(ProjectStore.ProjectRow);
      const channel = yield* decodeProject({
        projectId: "channel",
        title: "Release",
        workspaceRoot: "/agents/channel",
        defaultModelSelection: null,
        defaultThreadEnvMode: null,
        autoPull: false,
        faviconPath: null,
        projectIcon: null,
        scripts: [],
        createdAt: "2026-10-03T00:00:00Z",
        updatedAt: "2026-10-03T00:00:00Z",
        deletedAt: null,
        agentProfile: {
          instructions: "Coordinate releases",
          avatar: { preset: "circle", color: "#28B4FF" },
          archived: false,
          notificationsEnabled: true,
          conversationThreadId: "channel-chat",
          group: { memberProjectIds: ["lead", "designer"], leadProjectId: "lead" },
        },
      });
      const lead = yield* decodeProject({
        ...channel,
        projectId: "lead",
        title: "Alfred",
        agentProfile: {
          ...channel.agentProfile!,
          group: undefined,
          conversationThreadId: "lead-chat",
        },
      });
      const calls: import("@t3tools/contracts").AgentDelegateInput[] = [];
      let channelArchived = false;
      let leadArchived = false;
      const dependencies = Layer.mergeAll(
        NodeCrypto.layer,
        Scheduler.layer,
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ThreadLaunchService.ThreadLaunchService)({}),
        Layer.mock(ThreadManagementService.ThreadManagementService)({}),
        Layer.mock(ProjectStore.ProjectStoreV2)({
          get: (id) => {
            const project = id === "channel" ? channel : lead;
            return Effect.succeed(
              Option.some({
                ...project,
                agentProfile: {
                  ...project.agentProfile!,
                  archived: id === "channel" ? channelArchived : leadArchived,
                },
              }),
            );
          },
        }),
        Layer.mock(AgentDelegation.AgentDelegation)({
          delegate: (input) => {
            calls.push(input);
            return Effect.succeed({
              projectId: lead.projectId,
              threadId: lead.agentProfile!.conversationThreadId!,
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
          threadId: "channel-chat",
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
        expect(calls[0]?.text).toContain(input.prompt);
        expect(calls[0]?.text).toContain("Scheduled channel lead:");
        expect(calls[0]).not.toHaveProperty("modelSelection");
        channelArchived = true;
        expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
        channelArchived = false;
        leadArchived = true;
        expect((yield* service.runNow({ id: task.id })).task.lastRunStatus).toBe("failed");
        expect(calls).toHaveLength(1);
      }).pipe(Effect.provide(ScheduledTaskService.layer.pipe(Layer.provide(dependencies))));
    }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);
