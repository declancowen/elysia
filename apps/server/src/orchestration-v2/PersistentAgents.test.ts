import { assert, it } from "@effect/vitest";
import { AgentProfile, CommandId, EventId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { planProjectCommand } from "./ProjectCommands.ts";
import * as ProjectStore from "./ProjectStore.ts";

const decodeProfile = Schema.decodeUnknownEffect(AgentProfile);

it.layer(ProjectStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)))(
  "persistent agent metadata",
  (it) => {
    it.effect.each([false, true])(
      `%s: retains the native conversation, instructions and identity across edit/archive and reload`,
      (isGroup) =>
        Effect.gen(function* () {
          const projects = yield* ProjectStore.ProjectStoreV2;
          const projectId = ProjectId.make("persistent-agent");
          const threadId = ThreadId.make("persistent-agent-chat");
          const profile = yield* decodeProfile({
            instructions: "Help with ongoing work.",
            title: "Assistant",
            avatar: { preset: "brain", color: "blue" },
            archived: false,
            notificationsEnabled: true,
            conversationThreadId: threadId,
            ...(isGroup
              ? {
                  group: {
                    memberProjectIds: [ProjectId.make("alex"), ProjectId.make("friday")],
                    leadProjectId: ProjectId.make("alex"),
                  },
                }
              : {}),
          });
          yield* projects.apply({
            sequence: 1,
            eventId: EventId.make("agent-created"),
            aggregateKind: "project",
            aggregateId: projectId,
            occurredAt: "2026-10-02T00:00:00Z",
            commandId: null,
            causationEventId: null,
            correlationId: null,
            metadata: {},
            type: "project.created",
            payload: {
              projectId,
              title: "Alex",
              workspaceRoot: "/tmp/agent-alex",
              defaultModelSelection: null,
              agentProfile: profile,
              scripts: [],
              createdAt: "2026-10-02T00:00:00Z",
              updatedAt: "2026-10-02T00:00:00Z",
            },
          });
          const row = Option.getOrThrow(yield* projects.get(projectId));
          const { conversationThreadId: _link, group: _group, ...edit } = profile;
          const planned = planProjectCommand({
            command: {
              type: "project.meta.update",
              commandId: CommandId.make("agent-archive"),
              projectId,
              agentProfile: { ...edit, archived: true, instructions: "Review contracts." },
            },
            state: { project: row, workspaceOwner: undefined },
            eventId: EventId.make("agent-archived"),
            now: DateTime.makeUnsafe("2026-10-02T00:01:00Z"),
          });
          assert.isTrue(Result.isSuccess(planned));
          if (Result.isFailure(planned)) return;
          yield* projects.apply({ ...planned.success, sequence: 2 });
          const restored = Option.getOrThrow(yield* projects.get(projectId));
          const shell = Option.getOrThrow(yield* projects.getShell(projectId));
          assert.equal(restored.agentProfile?.conversationThreadId, threadId);
          assert.equal(restored.agentProfile?.instructions, "Review contracts.");
          assert.isTrue(restored.agentProfile?.archived);
          assert.deepEqual(restored.agentProfile?.group, profile.group);
          assert.deepEqual(shell.agentProfile, restored.agentProfile);
        }),
    );
  },
);
