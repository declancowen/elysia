import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { UsageLimitSourceId } from "@elysiatools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { HttpClient } from "effect/http";

import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as UsageLimitSources from "./UsageLimitSources.ts";

it.effect("keeps configured external usage hubs dormant under the Elysia policy", () =>
  Effect.gen(function* () {
    const requests = yield* Ref.make(0);
    const sources = yield* UsageLimitSources.make.pipe(
      Effect.provide(
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() =>
            Ref.update(requests, (count) => count + 1).pipe(
              Effect.andThen(Effect.die("External usage hubs must stay dormant")),
            ),
          ),
        ),
      ),
    );
    yield* sources.refresh;
    expect(yield* sources.current).toEqual([]);
    const refusal = yield* sources
      .consumeResetCredit({
        sourceId: UsageLimitSourceId.make("configured-hub"),
        accountId: "account",
        creditId: "credit",
      })
      .pipe(Effect.flip);
    expect(refusal.detail).toBe("The usage limit source is missing or disabled.");
    expect(yield* Ref.get(requests)).toBe(0);
  }).pipe(
    Effect.provide([
      ServerSettings.layerTest({
        usageLimitSources: {
          [UsageLimitSourceId.make("configured-hub")]: {
            kind: "cliproxy",
            url: "https://hub.fixture.test",
            managementKey: "fixture-key",
            enabled: true,
          },
        },
      }),
      Layer.mock(BackgroundPolicy.BackgroundPolicy)({
        shouldRunScopeWork: () => Effect.succeed(true),
      }),
      NodeCrypto.layer,
    ]),
    Effect.scoped,
  ),
);
