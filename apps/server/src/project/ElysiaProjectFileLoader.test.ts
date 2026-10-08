import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, describe, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ElysiaProjectFileLoader from "./ElysiaProjectFileLoader.ts";

const layerTest = Layer.empty.pipe(
  Layer.provideMerge(ElysiaProjectFileLoader.layer),
  Layer.provideMerge(NodeServices.layer),
);

const makeTempDir = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    prefix: "elysia-project-file-",
  });
});

const writeProjectFile = Effect.fn("writeProjectFile")(function* (
  cwd: string,
  contents: string,
  name = "elysia.json",
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.writeFileString(path.join(cwd, name), contents).pipe(Effect.orDie);
});

it.layer(layerTest)("ElysiaProjectFileLoader", (it) => {
  describe("load", () => {
    it.effect("loads and decodes a valid elysia.json", () =>
      Effect.gen(function* () {
        const loader = yield* ElysiaProjectFileLoader.ElysiaProjectFileLoader;
        const cwd = yield* makeTempDir;
        yield* writeProjectFile(
          cwd,
          `{
            // JSONC is tolerated
            "iconPath": "assets/logo.svg",
            "scripts": [{ "name": "Dev", "command": "pnpm dev" }],
          }`,
        );

        const loaded = yield* loader.load(cwd);

        expect(Option.isSome(loaded)).toBe(true);
        if (Option.isSome(loaded)) {
          expect(loaded.value.iconPath).toBe("assets/logo.svg");
          expect(loaded.value.scripts).toEqual([{ name: "Dev", command: "pnpm dev" }]);
        }
      }),
    );

    it.effect("loads existing legacy-only repository configuration", () =>
      Effect.gen(function* () {
        const loader = yield* ElysiaProjectFileLoader.ElysiaProjectFileLoader;
        const cwd = yield* makeTempDir;
        yield* writeProjectFile(
          cwd,
          '{"scripts":[{"name":"Legacy","command":"vp dev"}]}',
          "t3.json",
        );
        expect(Option.getOrNull(yield* loader.load(cwd))?.scripts?.[0]?.name).toBe("Legacy");
      }),
    );
    it.effect("prefers elysia.json when both files exist", () =>
      Effect.gen(function* () {
        const loader = yield* ElysiaProjectFileLoader.ElysiaProjectFileLoader;
        const cwd = yield* makeTempDir;
        yield* writeProjectFile(cwd, '{"iconPath":"legacy.svg"}', "t3.json");
        yield* writeProjectFile(cwd, '{"iconPath":"elysia.svg"}');
        expect(Option.getOrNull(yield* loader.load(cwd))?.iconPath).toBe("elysia.svg");
      }),
    );
    it.effect("does not hide malformed elysia.json with legacy configuration", () =>
      Effect.gen(function* () {
        const loader = yield* ElysiaProjectFileLoader.ElysiaProjectFileLoader;
        const cwd = yield* makeTempDir;
        yield* writeProjectFile(cwd, '{"iconPath":"legacy.svg"}', "t3.json");
        yield* writeProjectFile(cwd, "{ invalid");
        expect(Option.isNone(yield* loader.load(cwd))).toBe(true);
      }),
    );

    it.effect("returns none when elysia.json is missing", () =>
      Effect.gen(function* () {
        const loader = yield* ElysiaProjectFileLoader.ElysiaProjectFileLoader;
        const cwd = yield* makeTempDir;

        const loaded = yield* loader.load(cwd);

        expect(Option.isNone(loaded)).toBe(true);
      }),
    );

    it.effect("returns none for malformed JSON without failing", () =>
      Effect.gen(function* () {
        const loader = yield* ElysiaProjectFileLoader.ElysiaProjectFileLoader;
        const cwd = yield* makeTempDir;
        yield* writeProjectFile(cwd, "{ not json");

        const loaded = yield* loader.load(cwd);

        expect(Option.isNone(loaded)).toBe(true);
      }),
    );

    it.effect("returns none for schema-invalid files without failing", () =>
      Effect.gen(function* () {
        const loader = yield* ElysiaProjectFileLoader.ElysiaProjectFileLoader;
        const cwd = yield* makeTempDir;
        yield* writeProjectFile(cwd, '{ "scripts": [{ "name": "Dev" }] }');

        const loaded = yield* loader.load(cwd);

        expect(Option.isNone(loaded)).toBe(true);
      }),
    );
  });
});
