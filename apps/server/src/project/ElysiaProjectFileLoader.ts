/**
 * ElysiaProjectFileLoader - Effect service that loads the checked-in `elysia.json`
 * project file from a workspace root.
 *
 * Loading is best-effort: a missing file resolves to `Option.none`, and
 * unreadable or invalid files are logged and treated as absent so callers
 * can fall back to their defaults.
 *
 * @module ElysiaProjectFileLoader
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  ELYSIA_PROJECT_FILE_NAME,
  LEGACY_PROJECT_FILE_NAME,
  type ElysiaProjectFile,
} from "@elysiatools/contracts";
import { ElysiaProjectFileFromJson } from "@elysiatools/shared/elysiaProjectFile";

const decodeElysiaProjectFileJson = Schema.decodeEffect(ElysiaProjectFileFromJson);

export class ElysiaProjectFileLoadError extends Schema.TaggedError<ElysiaProjectFileLoadError>()(
  "ElysiaProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${ELYSIA_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

/** Service tag for elysia.json project file loading. */
export class ElysiaProjectFileLoader extends Context.Service<
  ElysiaProjectFileLoader,
  {
    /**
     * Load and decode `elysia.json` at the workspace root.
     *
     * Never fails: missing, unreadable, or invalid files resolve to
     * `Option.none` (invalid files are logged as warnings).
     */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<ElysiaProjectFile>>;
  }
>()("@elysiatools/server/project/ElysiaProjectFileLoader") {}

const logElysiaProjectFileLoadError = (error: ElysiaProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

/** Only a missing new file permits using the legacy repository configuration. */
export const readProjectFile = Effect.fn("ElysiaProjectFileLoader.readProjectFile")(function* (
  workspaceRoot: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (name: string) => {
    const filePath = path.join(workspaceRoot, name);
    return fileSystem
      .readFileString(filePath)
      .pipe(Effect.map((contents) => ({ filePath, contents })));
  };
  return yield* read(ELYSIA_PROJECT_FILE_NAME).pipe(
    Effect.catchTags({
      PlatformError: (error) =>
        error.reason._tag === "NotFound" ? read(LEGACY_PROJECT_FILE_NAME) : Effect.fail(error),
    }),
  );
});

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: ElysiaProjectFileLoader["Service"]["load"] = Effect.fn(
    "ElysiaProjectFileLoader.load",
  )(function* (workspaceRoot) {
    const filePath = path.join(workspaceRoot, ELYSIA_PROJECT_FILE_NAME);
    const raw = yield* readProjectFile(workspaceRoot).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
      Effect.asSome,
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(Option.none<{ filePath: string; contents: string }>())
            : logElysiaProjectFileLoadError(
                new ElysiaProjectFileLoadError({
                  operation: "read",
                  workspaceRoot,
                  filePath,
                  cause: error,
                }),
              ).pipe(Effect.as(Option.none<{ filePath: string; contents: string }>())),
      }),
    );
    if (Option.isNone(raw)) {
      return Option.none<ElysiaProjectFile>();
    }
    return yield* decodeElysiaProjectFileJson(raw.value.contents).pipe(
      Effect.asSome,
      Effect.catchTags({
        SchemaError: (error) =>
          logElysiaProjectFileLoadError(
            new ElysiaProjectFileLoadError({
              operation: "decode",
              workspaceRoot,
              filePath: raw.value.filePath,
              cause: error,
            }),
          ).pipe(Effect.as(Option.none<ElysiaProjectFile>())),
      }),
    );
  });

  return ElysiaProjectFileLoader.of({ load });
});

export const layer = Layer.effect(ElysiaProjectFileLoader, make);
