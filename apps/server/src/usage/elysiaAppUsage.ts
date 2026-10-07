import { TurnTokenUsage, UsageReadError, type ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import type { UsageRecord } from "./usageTranscripts.ts";

const Row = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  model: Schema.String,
  completedAt: Schema.String,
  usage: Schema.fromJsonString(TurnTokenUsage),
});
const decodeRows = Schema.decodeUnknownEffect(Schema.Array(Row));

/** SDK turns remain in the app database even when the CLI does not write session files. */
export const readElysiaAppUsage = Effect.fn("UsageService.readElysiaAppUsage")(function* (
  instanceId: ProviderInstanceId,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`
    SELECT turns.provider_turn_id AS id, turns.provider_thread_id AS sessionId,
      json_extract(runs.payload_json, '$.modelSelection.model') AS model,
      turns.completed_at AS completedAt,
      json_extract(turns.payload_json, '$.turnTokenUsage') AS usage
    FROM orchestration_v2_projection_provider_turns AS turns
    JOIN orchestration_v2_projection_provider_threads AS threads
      ON threads.provider_thread_id = turns.provider_thread_id
    JOIN orchestration_v2_projection_nodes AS nodes ON nodes.node_id = turns.node_id
    JOIN orchestration_v2_projection_runs AS runs ON runs.run_id = nodes.run_id
    WHERE threads.driver = 'claudeAgent' AND threads.provider_instance_id = ${instanceId}
      AND threads.thread_id IS NOT NULL AND turns.completed_at IS NOT NULL
      AND json_extract(turns.payload_json, '$.turnTokenUsage.usageStatus') IN ('complete', 'partial')
  `.pipe(
    Effect.flatMap(decodeRows),
    Effect.mapError(
      (cause) =>
        new UsageReadError({
          reason: "scanFailed",
          detail: "Could not read saved Elysia usage.",
          cause,
        }),
    ),
  );
  return rows.map((row): UsageRecord => ({
    provider: "claude",
    timestampMs: Date.parse(row.completedAt),
    model: row.model,
    sessionId: row.sessionId,
    totals: {
      uncachedInputTokens: Math.max(
        0,
        (row.usage.inputTokens ?? 0) -
          (row.usage.cachedInputTokens ?? 0) -
          (row.usage.cacheCreationTokens ?? 0),
      ),
      cachedInputTokens: row.usage.cachedInputTokens ?? 0,
      cacheCreationTokens: row.usage.cacheCreationTokens ?? 0,
      outputTokens: row.usage.outputTokens ?? 0,
      reasoningTokens: row.usage.reasoningTokens ?? 0,
    },
    reportedCostUsd: null,
    speed: "standard",
    dedupeKey: `elysia-turn:${row.id}`,
  }));
});
