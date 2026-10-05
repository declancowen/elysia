import {
  Page,
  PageError,
  PageId,
  PageListResult,
  type PageLookupInput,
  type PageMutationResult,
  type PageSaveInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";

export class PageService extends Context.Service<
  PageService,
  {
    readonly list: () => Effect.Effect<PageListResult, PageError>;
    readonly subscribeList: () => Stream.Stream<PageListResult, PageError>;
    readonly get: (input: PageLookupInput) => Effect.Effect<PageMutationResult, PageError>;
    readonly save: (input: PageSaveInput) => Effect.Effect<PageMutationResult, PageError>;
    readonly delete: (input: PageLookupInput) => Effect.Effect<PageLookupInput, PageError>;
  }
>()("t3/pages/PageService") {}
const fail = (code: PageError["code"], message: string) => new PageError({ code, message });
const isPageError = Schema.is(PageError);
const decodePage = Schema.decodeUnknownEffect(Page);
const decodeList = Schema.decodeUnknownEffect(PageListResult);
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const changes = yield* PubSub.sliding<void>(1);
  const lock = yield* Semaphore.make(1);
  const notify = PubSub.publish(changes, undefined).pipe(Effect.asVoid);
  const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, PageError, R> =>
    effect.pipe(
      Effect.mapError((cause) =>
        isPageError(cause)
          ? cause
          : new PageError({ code: "storage_error", message: "Could not access pages.", cause }),
      ),
    );
  const read = (id: PageId) =>
    Effect.gen(function* () {
      const rows =
        yield* sql`SELECT id, title, content, project_id AS "projectId", created_at AS "createdAt", updated_at AS "updatedAt", revision FROM pages WHERE id = ${id}`;
      if (!rows[0]) return yield* fail("not_found", "Page not found.");
      return yield* decodePage(rows[0]);
    });
  const list = () =>
    wrap(
      Effect.gen(function* () {
        const rows =
          yield* sql`SELECT id, title, project_id AS "projectId", created_at AS "createdAt", updated_at AS "updatedAt", revision FROM pages ORDER BY updated_at DESC, id`;
        return yield* decodeList({ pages: rows });
      }),
    );
  const save = (input: PageSaveInput) =>
    wrap(
      lock
        .withPermit(
          sql.withTransaction(
            Effect.gen(function* () {
              const previous = input.id ? yield* read(input.id) : null;
              if (previous && input.expectedRevision !== previous.revision)
                return yield* fail(
                  "conflict",
                  "This page has changed. Reload it before saving to avoid overwriting newer edits.",
                );
              if (!previous && !input.title)
                return yield* fail("invalid_request", "A page title is required.");
              if (input.projectId && input.projectId !== previous?.projectId) {
                const project = yield* projects.get(input.projectId);
                if (
                  Option.isNone(project) ||
                  project.value.deletedAt !== null ||
                  project.value.agentProfile
                )
                  return yield* fail("invalid_request", "Choose an existing workspace project.");
              }
              const timestamp = DateTime.formatIso(yield* DateTime.now);
              const page = yield* decodePage({
                id:
                  previous?.id ??
                  PageId.make(`page-${yield* crypto.randomUUIDv4.pipe(Effect.orDie)}`),
                title: input.title ?? previous?.title,
                content: input.content ?? previous?.content ?? "",
                projectId:
                  input.projectId === undefined ? (previous?.projectId ?? null) : input.projectId,
                createdAt: previous?.createdAt ?? timestamp,
                updatedAt: timestamp,
                revision: (previous?.revision ?? 0) + 1,
              });
              yield* sql`INSERT INTO pages (id, title, content, project_id, created_at, updated_at, revision)
      VALUES (${page.id}, ${page.title}, ${page.content}, ${page.projectId}, ${page.createdAt}, ${page.updatedAt}, ${page.revision})
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, project_id=excluded.project_id, updated_at=excluded.updated_at, revision=excluded.revision`;
              return { page };
            }),
          ),
        )
        .pipe(Effect.tap(() => notify)),
    );
  return PageService.of({
    list,
    subscribeList: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Buffer edits before reading the initial snapshot so no mutation is missed.
          const subscription = yield* PubSub.subscribe(changes);
          return Stream.concat(
            Stream.fromEffect(list()),
            Stream.fromSubscription(subscription).pipe(Stream.mapEffect(list)),
          );
        }),
      ),
    get: (input) => wrap(read(input.id).pipe(Effect.map((page) => ({ page })))),
    save,
    delete: (input) =>
      wrap(
        lock
          .withPermit(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* read(input.id);
                yield* sql`DELETE FROM pages WHERE id = ${input.id}`;
                return input;
              }),
            ),
          )
          .pipe(Effect.tap(() => notify)),
      ),
  });
});
export const layer = Layer.effect(PageService, make);
