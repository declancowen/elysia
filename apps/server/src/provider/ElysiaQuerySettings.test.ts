import * as Path from "effect/Path";
import * as HostProcess from "@elysiatools/shared/HostProcess";
import { expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Scope from "effect/Scope";
import * as Exit from "effect/Exit";
import * as PlatformError from "effect/PlatformError";
import { writeElysiaQuerySettings } from "./ElysiaQuerySettings.ts";
import { elysiaAgentProtection } from "./ElysiaAgentProtection.ts";

it.effect(
  "keeps native per-model routing private, preserves query settings and cleans up without changing saved sign-in",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "elysia-query-settings-" });
        yield* fs.makeDirectory(`${root}/.claude`);
        const original = JSON.stringify({
          model: "deepseek-v4.1-flash",
          env: { ANTHROPIC_CUSTOM_HEADERS: "saved-default" },
        });
        yield* fs.writeFileString(`${root}/.claude/settings.json`, original);
        const environment = {
          ELYSIA_PROFILE_ROOT: root,
          ELYSIA_ACTIVE_MODEL: "gpt-6.1-sol",
          ANTHROPIC_MODEL: "gpt-6.1-sol",
          ANTHROPIC_CUSTOM_HEADERS:
            "x-portkey-api-key: fixture-secret\nx-portkey-beta: use-responses-api",
          CLAUDE_CODE_MAX_CONTEXT_TOKENS: "272000",
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: "230000",
          ANTHROPIC_AUTH_TOKEN: "fixture-auth",
          SSL_CERT_FILE: "/fixture/native-company-ca.pem",
          PATH: "/fixture/bin",
        };
        const scope = yield* Scope.make();
        const file = yield* writeElysiaQuerySettings({
          environment,
          settings: {
            autoMemoryEnabled: true,
            permissions: { deny: ["Read(/private)"] },
            env: { DISABLE_COMPACT: "0" },
          },
        }).pipe(Scope.provide(scope));
        expect(file).toBeDefined();
        const data = JSON.parse(yield* fs.readFileString(file!));
        expect(data).toMatchObject({
          autoMemoryEnabled: true,
          permissions: { deny: ["Read(/private)"] },
          env: {
            ANTHROPIC_MODEL: "gpt-6.1-sol",
            ANTHROPIC_CUSTOM_HEADERS: environment.ANTHROPIC_CUSTOM_HEADERS,
            CLAUDE_CODE_MAX_CONTEXT_TOKENS: "272000",
            CLAUDE_CODE_AUTO_COMPACT_WINDOW: "230000",
            DISABLE_COMPACT: "0",
          },
        });
        for (const key of ["ANTHROPIC_AUTH_TOKEN", "SSL_CERT_FILE", "PATH"])
          expect(data.env).not.toHaveProperty(key);
        const directory = path.dirname(file!);
        if ((yield* HostProcess.Platform) !== "win32") {
          expect((yield* fs.stat(file!)).mode & 0o777).toBe(0o600);
          expect((yield* fs.stat(directory)).mode & 0o777).toBe(0o700);
        }
        const policy = elysiaAgentProtection(environment);
        const canonical = yield* fs.realPath(file!);
        expect(
          policy.sandbox?.filesystem?.denyRead?.some((protectedPath) =>
            canonical.startsWith(protectedPath + path.sep),
          ),
        ).toBe(true);
        yield* Scope.close(scope, Exit.void);
        expect(yield* fs.exists(file!)).toBe(false);
        expect(yield* fs.readFileString(`${root}/.claude/settings.json`)).toBe(original);
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
);

it.effect("removes a partially prepared query directory when the file write fails", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "elysia-query-failure-" });
      const scope = yield* Scope.make();
      const failure = yield* writeElysiaQuerySettings({
        environment: { ELYSIA_PROFILE_ROOT: root, ELYSIA_ACTIVE_MODEL: "gpt-6.1-sol" },
      }).pipe(
        Scope.provide(scope),
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          writeFileString: (path) =>
            Effect.fail(
              PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "writeFileString",
                pathOrDescriptor: path,
              }),
            ),
        }),
        Effect.flip,
      );
      expect(failure.message).toBe("Could not prepare the native model settings for this query.");
      yield* Scope.close(scope, Exit.void);
      expect(yield* fs.readDirectory(`${root}/.elysia`)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  ),
);
