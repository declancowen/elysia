import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ThreadId, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { ServerConfig } from "../config.ts";
import * as Projects from "../project/ProjectService.ts";
import * as Threads from "./ThreadManagementService.ts";
import * as Store from "./ProjectStore.ts";
import { createPersistentAgent, layer as persistentAgentsLayer } from "./PersistentAgents.ts";

for (const scenario of [
  "one",
  "duplicate",
  "missing-lead",
  "missing",
  "archived",
  "nested",
  "unlinked",
] as const) {
  it.effect(`refuses invalid group ${scenario} before creating its workspace or chat`, () => {
    const lead = ProjectId.make("lead");
    const second = ProjectId.make("second");
    const group = {
      memberProjectIds:
        scenario === "one" ? [lead] : scenario === "duplicate" ? [lead, lead] : [lead, second],
      leadProjectId: scenario === "missing-lead" ? ProjectId.make("outsider") : lead,
    };
    return Effect.gen(function* () {
      const error = yield* createPersistentAgent({
        name: "Team",
        agentProfile: {
          instructions: "",
          avatar: { preset: "circle", color: "blue" },
          archived: false,
          notificationsEnabled: true,
          group,
        },
        defaultModelSelection: {
          instanceId: ProviderInstanceId.make("elysia"),
          model: "native-model",
        },
      }).pipe(Effect.flip);
      assert.include(
        error.message,
        scenario === "one" || scenario === "duplicate" || scenario === "missing-lead"
          ? "distinct agents"
          : "available individual agents",
      );
    }).pipe(
      Effect.provide(
        persistentAgentsLayer.pipe(
          Layer.provideMerge(
            Layer.mergeAll(
              NodeServices.layer,
              SqlitePersistenceMemory,
              Layer.mock(ProviderRegistry)({
                getProviders: Effect.die("Invalid group reached provider lookup"),
              }),
              Layer.mock(ServerSettingsService)({
                updateSettings: () => Effect.die("Invalid group reached settings writes"),
              }),
              ServerConfig.layerTest(process.cwd(), { prefix: "elysia-invalid-group-" }).pipe(
                Layer.provide(NodeServices.layer),
              ),
              Layer.mock(Projects.ProjectService)({
                create: () => Effect.die("Invalid group reached project creation"),
              }),
              Layer.mock(Threads.ThreadManagementService)({
                dispatch: () => Effect.die("Invalid group reached thread creation"),
              }),
              Layer.mock(Store.ProjectStoreV2)({
                get: (projectId) =>
                  Effect.succeed(
                    scenario === "missing"
                      ? Option.none()
                      : Option.some({
                          projectId,
                          title: "Member",
                          workspaceRoot: "/tmp/member",
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
                            instructions: "Help",
                            avatar: { preset: "circle", color: "blue" },
                            archived: scenario === "archived",
                            notificationsEnabled: true,
                            ...(scenario === "unlinked"
                              ? {}
                              : { conversationThreadId: ThreadId.make("member-chat") }),
                            ...(scenario === "nested" ? { group } : {}),
                          },
                        }),
                  ),
              }),
            ),
          ),
        ),
      ),
    );
  });
}
