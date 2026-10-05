import { assert, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { EventId, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as Pages from "./PageService.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import migration from "../persistence/Migrations/059_Pages.ts";
const database = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const columns = yield* sql`PRAGMA table_info(pages)`;
    if (columns.length === 0) yield* migration;
  }),
).pipe(Layer.provideMerge(SqlitePersistenceMemory));
const testLayer = Pages.layer.pipe(
  Layer.provideMerge(ProjectStore.layer),
  Layer.provideMerge(database),
  Layer.provide(NodeCrypto.layer),
);
it.layer(testLayer)("PageService", (it) => {
  it.effect("persists rich content, protects concurrent edits and permanently deletes pages", () =>
    Effect.gen(function* () {
      const pages = yield* Pages.PageService;
      const created = (yield* pages.save({
        title: "Notes",
        content: "<p><strong>Private notes</strong></p>",
      })).page;
      assert.match(created.id, /^page-/);
      assert.equal(created.revision, 1);
      assert.deepEqual((yield* pages.get({ id: created.id })).page, created);
      const summary = (yield* pages.list()).pages.find((page) => page.id === created.id)!;
      assert.isFalse("content" in summary);
      const results = yield* Effect.all(
        [
          pages
            .save({ id: created.id, expectedRevision: 1, title: "First edit" })
            .pipe(Effect.result),
          pages
            .save({ id: created.id, expectedRevision: 1, title: "Second edit" })
            .pipe(Effect.result),
        ],
        { concurrency: 2 },
      );
      assert.lengthOf(
        results.filter((result) => result._tag === "Success"),
        1,
      );
      const conflict = results.find((result) => result._tag === "Failure");
      assert.equal(conflict?._tag === "Failure" ? conflict.failure.code : null, "conflict");
      const edited = (yield* pages.get({ id: created.id })).page;
      assert.equal(edited.createdAt, created.createdAt);
      assert.equal(edited.revision, 2);
      assert.equal(edited.content, created.content);
      yield* pages.delete({ id: created.id });
      assert.equal((yield* Effect.flip(pages.get({ id: created.id }))).code, "not_found");
      assert.isFalse((yield* pages.list()).pages.some((page) => page.id === created.id));
    }),
  );
  it.effect("validates titles and existing project links before any write", () =>
    Effect.gen(function* () {
      const pages = yield* Pages.PageService;
      assert.equal(
        (yield* Effect.flip(pages.save({ content: "<p>No title</p>" }))).code,
        "invalid_request",
      );
      assert.equal(
        (yield* Effect.flip(
          pages.save({ title: "Missing project", projectId: ProjectId.make("missing-project") }),
        )).code,
        "invalid_request",
      );
      const projects = yield* ProjectStore.ProjectStoreV2;
      assert.isTrue(Option.isNone(yield* projects.get(ProjectId.make("missing-project"))));
      assert.isFalse((yield* pages.list()).pages.some((page) => page.title === "Missing project"));
    }),
  );
  it.effect("buffers an edit between the subscription's initial snapshot and live updates", () =>
    Effect.gen(function* () {
      const pages = yield* Pages.PageService;
      const created = (yield* pages.save({ title: "Before subscription" })).page;
      let received = 0;
      const snapshots = yield* pages.subscribeList().pipe(
        Stream.mapEffect((snapshot) =>
          Effect.gen(function* () {
            if (received++ === 0)
              yield* pages.save({
                id: created.id,
                expectedRevision: 1,
                title: "After subscription",
              });
            return snapshot;
          }),
        ),
        Stream.take(2),
        Stream.runCollect,
      );
      assert.equal(
        snapshots[0]?.pages.find((page) => page.id === created.id)?.title,
        "Before subscription",
      );
      assert.equal(
        snapshots[1]?.pages.find((page) => page.id === created.id)?.title,
        "After subscription",
      );
      yield* pages.delete({ id: created.id });
    }),
  );
  it.effect(
    "links pages to a workspace project and can remove the link without losing content",
    () =>
      Effect.gen(function* () {
        const pages = yield* Pages.PageService;
        const projects = yield* ProjectStore.ProjectStoreV2;
        const projectId = ProjectId.make("page-project");
        const timestamp = "2026-10-05T00:00:00.000Z";
        yield* projects.apply({
          sequence: 1,
          eventId: EventId.make("page-project-event"),
          aggregateKind: "project",
          aggregateId: projectId,
          occurredAt: timestamp,
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.created",
          payload: {
            projectId,
            title: "Page project",
            workspaceRoot: "/tmp/page-project",
            defaultModelSelection: null,
            scripts: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });
        const created = (yield* pages.save({
          title: "Project notes",
          content: "<p>Notes</p>",
          projectId,
        })).page;
        assert.equal(created.projectId, projectId);
        const unlinked = (yield* pages.save({
          id: created.id,
          expectedRevision: created.revision,
          projectId: null,
        })).page;
        assert.isNull(unlinked.projectId);
        assert.equal(unlinked.content, created.content);
        assert.equal(unlinked.title, created.title);
        yield* pages.delete({ id: created.id });
      }),
  );
});
