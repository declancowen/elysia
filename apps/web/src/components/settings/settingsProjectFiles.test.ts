import { EnvironmentId, type ProjectReadFileResult } from "@elysiatools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  files: new Map<string, Atom.Atom<AsyncResult.AsyncResult<ProjectReadFileResult, Error>>>(),
  reads: [] as string[],
}));
vi.mock("../files/projectFilesQueryState", () => ({
  getProjectFileQueryAtom: (_environmentId: string, _cwd: string, fileName: string) => {
    state.reads.push(fileName);
    const atom = state.files.get(fileName);
    if (!atom) throw new Error(`Unexpected read of ${fileName}`);
    return atom;
  },
  optimisticFileAtom: () => Atom.make(null),
}));
import { memberProjectFilesAtom } from "./settingsProjectFiles";

const environmentId = EnvironmentId.make("settings-files");
let registry: AtomRegistry.AtomRegistry;
let sequence = 0;
const file = (name: string, contents: string, extra: Partial<ProjectReadFileResult> = {}) =>
  AsyncResult.success({
    relativePath: name,
    contents,
    byteLength: contents.length,
    truncated: false,
    ...extra,
  });
const read = () => {
  const key = `physical-${sequence++}`;
  const membersKey = JSON.stringify([[environmentId, "/project", key]]);
  const atom = memberProjectFilesAtom(membersKey);
  expect(memberProjectFilesAtom(JSON.stringify([[environmentId, "/project", key]]))).toBe(atom);
  return { files: registry.get(atom), key };
};
beforeEach(() => {
  registry = AtomRegistry.make();
  state.files.clear();
  state.reads.length = 0;
  state.files.set("t3.json", Atom.make(file("t3.json", '{"defaultThreadEnvMode":"worktree"}')));
});
afterEach(() => registry.dispose());

describe("settings member project files", () => {
  it("uses the primary file without reading legacy settings", () => {
    state.files.set(
      "elysia.json",
      Atom.make(file("elysia.json", '{"defaultThreadEnvMode":"local"}')),
    );
    const { files, key } = read();
    expect(files.get(key)?.defaultThreadEnvMode).toBe("local");
    expect(state.reads).toEqual(["elysia.json"]);
  });

  it("falls back only when the primary file is absent", () => {
    state.files.set("elysia.json", Atom.make(file("elysia.json", "", { exists: false })));
    const { files, key } = read();
    expect(files.get(key)?.defaultThreadEnvMode).toBe("worktree");
    expect(state.reads).toEqual(["elysia.json", "t3.json"]);
  });

  it.each(["invalid", "truncated", "permission"])(
    "does not mask a %s primary file with legacy settings",
    (kind) => {
      state.files.set(
        "elysia.json",
        Atom.make(
          kind === "permission"
            ? AsyncResult.failure<ProjectReadFileResult, Error>(
                Cause.fail(new Error("Permission denied")),
              )
            : file("elysia.json", "invalid JSON", { truncated: kind === "truncated" }),
        ),
      );
      const { files, key } = read();
      expect(files.get(key)).toBeNull();
      expect(state.reads).toEqual(["elysia.json"]);
    },
  );

  it("waits for the primary file before considering legacy settings", () => {
    state.files.set(
      "elysia.json",
      Atom.make(AsyncResult.initial<ProjectReadFileResult, Error>(true)),
    );
    expect(read().files.size).toBe(0);
    expect(state.reads).toEqual(["elysia.json"]);
  });
});
