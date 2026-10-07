import { assert, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { readElysiaAppUsage } from "./elysiaAppUsage.ts";
import { UsageAggregator } from "./usageAggregation.ts";
import { parseRateTable } from "./usagePricing.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

it.effect("recovers saved app usage without CLI files and isolates instances and subagents", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE orchestration_v2_projection_provider_turns (provider_turn_id TEXT, provider_thread_id TEXT, node_id TEXT, completed_at TEXT, payload_json TEXT)`;
    yield* sql`CREATE TABLE orchestration_v2_projection_provider_threads (provider_thread_id TEXT, driver TEXT, provider_instance_id TEXT, thread_id TEXT)`;
    yield* sql`CREATE TABLE orchestration_v2_projection_nodes (node_id TEXT, run_id TEXT)`;
    yield* sql`CREATE TABLE orchestration_v2_projection_runs (run_id TEXT, payload_json TEXT)`;
    yield* sql`INSERT INTO orchestration_v2_projection_runs VALUES ('run', ${encodeJson({ modelSelection: { model: "example-model" } })})`;
    yield* sql`INSERT INTO orchestration_v2_projection_nodes VALUES ('node', 'run')`;
    for (const [id, instance, appThread] of [
      ["native", "elysia", "app-thread"],
      ["other", "other", "app-thread"],
      ["child", "elysia", null],
    ]) {
      yield* sql`INSERT INTO orchestration_v2_projection_provider_threads VALUES (${id}, 'claudeAgent', ${instance}, ${appThread})`;
      yield* sql`INSERT INTO orchestration_v2_projection_provider_turns VALUES (${id}, ${id}, 'node', '2026-10-05T12:00:00Z', ${encodeJson({ turnTokenUsage: { usageStatus: "complete", usageScope: "main_agent", hasSubagents: false, inputTokens: 100, cachedInputTokens: 30, cacheCreationTokens: 10, outputTokens: 20 } })})`;
    }
    const records = yield* readElysiaAppUsage(ProviderInstanceId.make("elysia"));
    assert.equal(records.length, 1);
    assert.equal(records[0]?.totals.uncachedInputTokens, 60);
    assert.equal(records[0]?.totals.outputTokens, 20);
    const aggregate = new UsageAggregator({
      timeZone: "UTC",
      sinceDay: "2026-10-05",
      untilDay: "2026-10-05",
      rates: parseRateTable({
        "example-model": { input_cost_per_token: 0.01, output_cost_per_token: 0.02 },
      }),
    });
    aggregate.add(records[0]!, "app");
    aggregate.add(records[0]!, "app");
    assert.equal(aggregate.finish().buckets[0]?.records, 1);
    assert.equal(aggregate.finish().buckets[0]?.totals.cachedInputTokens, 30);
  }).pipe(
    Effect.provide(
      NodeSqliteClient.layer({ filename: ":memory:" }).pipe(Layer.provide(NodeServices.layer)),
    ),
  ),
);
