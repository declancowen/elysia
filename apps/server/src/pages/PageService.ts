import {
  Page,
  PageError,
  PageId,
  PageListResult,
  type PageLookupInput,
  type PageMutationResult,
  type PageSaveInput,
} from "@elysiatools/contracts";
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
import * as SqlClient from "effect/sql/SqlClient";
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
>()("@elysiatools/server/pages/PageService") {}
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
        yield* sql`SELECT id, title, content, kind, parent_folder_id AS "parentFolderId", project_id AS "projectId", created_at AS "createdAt", updated_at AS "updatedAt", revision FROM pages WHERE id = ${id}`;
      if (!rows[0]) return yield* fail("not_found", "Page not found.");
      return yield* decodePage(rows[0]);
    });
  const list = () =>
    wrap(
      Effect.gen(function* () {
        const rows =
          yield* sql`SELECT id, title, kind, parent_folder_id AS "parentFolderId", substr(content, 1, 2000) AS "contentPreview", project_id AS "projectId", created_at AS "createdAt", updated_at AS "updatedAt", revision FROM pages ORDER BY updated_at DESC, id`;
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
              const kind = input.kind ?? previous?.kind ?? "page";
              if (previous && kind !== previous.kind)
                return yield* fail(
                  "invalid_request",
                  "A page cannot be converted into a folder or a folder into a page.",
                );
              if (kind === "folder" && input.content)
                return yield* fail("invalid_request", "Folders cannot contain document content.");
              const parentFolderId =
                input.parentFolderId === undefined
                  ? (previous?.parentFolderId ?? null)
                  : input.parentFolderId;
              let inheritedProjectId: Page["projectId"] = null;
              if (parentFolderId) {
                const ancestors = yield* sql<{
                  id: PageId;
                  kind: "page" | "folder";
                  project_id: Page["projectId"];
                  parent_folder_id: PageId | null;
                }>`WITH RECURSIVE ancestors AS (
                  SELECT id, kind, project_id, parent_folder_id FROM pages WHERE id = ${parentFolderId}
                  UNION SELECT p.id, p.kind, p.project_id, p.parent_folder_id FROM pages p JOIN ancestors a ON p.id = a.parent_folder_id
                ) SELECT * FROM ancestors`;
                const parent = ancestors.find((row) => row.id === parentFolderId);
                if (!parent || parent.kind !== "folder")
                  return yield* fail("invalid_request", "Choose an existing parent folder.");
                if (previous && ancestors.some((row) => row.id === previous.id))
                  return yield* fail(
                    "invalid_request",
                    "A folder cannot be moved inside itself or a descendant.",
                  );
                // The highest linked ancestor owns the project for its entire subtree.
                const byId = new Map(ancestors.map((row) => [row.id, row]));
                let ancestor: (typeof ancestors)[number] | undefined = parent;
                for (let remaining = ancestors.length; ancestor && remaining > 0; remaining--) {
                  if (ancestor.project_id !== null) inheritedProjectId = ancestor.project_id;
                  ancestor = ancestor.parent_folder_id
                    ? byId.get(ancestor.parent_folder_id)
                    : undefined;
                }
              }
              const moved =
                input.parentFolderId !== undefined &&
                parentFolderId !== (previous?.parentFolderId ?? null);
              const projectId =
                inheritedProjectId ??
                (moved && parentFolderId
                  ? null
                  : input.projectId === undefined
                    ? (previous?.projectId ?? null)
                    : input.projectId);
              if (
                inheritedProjectId &&
                input.projectId !== undefined &&
                input.projectId !== inheritedProjectId &&
                !moved
              )
                return yield* fail(
                  "invalid_request",
                  "The parent folder determines this item's project. Change the folder's project instead.",
                );
              if (projectId && projectId !== previous?.projectId) {
                const project = yield* projects.get(projectId);
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
                kind,
                parentFolderId,
                content: input.content ?? previous?.content ?? "",
                projectId,
                createdAt: previous?.createdAt ?? timestamp,
                updatedAt: timestamp,
                revision: (previous?.revision ?? 0) + 1,
              });
              yield* sql`INSERT INTO pages (id, title, content, kind, parent_folder_id, project_id, created_at, updated_at, revision)
      VALUES (${page.id}, ${page.title}, ${page.content}, ${page.kind}, ${page.parentFolderId}, ${page.projectId}, ${page.createdAt}, ${page.updatedAt}, ${page.revision})
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, kind=excluded.kind, parent_folder_id=excluded.parent_folder_id, project_id=excluded.project_id, updated_at=excluded.updated_at, revision=excluded.revision`;
              if (kind === "folder" && (moved || projectId !== previous?.projectId)) {
                yield* sql`WITH RECURSIVE descendants(id) AS (
                  SELECT id FROM pages WHERE parent_folder_id = ${page.id}
                  UNION SELECT p.id FROM pages p JOIN descendants d ON p.parent_folder_id = d.id
                ) UPDATE pages SET project_id = ${page.projectId}, revision = revision + 1, updated_at = ${timestamp}
                  WHERE id IN (SELECT id FROM descendants)`;
              }
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
                yield* sql`WITH RECURSIVE descendants(id) AS (
                  SELECT id FROM pages WHERE id = ${input.id}
                  UNION SELECT p.id FROM pages p JOIN descendants d ON p.parent_folder_id = d.id
                ) DELETE FROM pages WHERE id IN (SELECT id FROM descendants)`;
                return input;
              }),
            ),
          )
          .pipe(Effect.tap(() => notify)),
      ),
  });
});
export const layer = Layer.effect(PageService, make);
