import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProjectId, ThreadId, IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const WorkTaskId = TrimmedNonEmptyString.check(Schema.isPattern(/^TASK-[1-9][0-9]*$/)).pipe(
  Schema.brand("WorkTaskId"),
);
export type WorkTaskId = typeof WorkTaskId.Type;
export const WorkTaskStatus = Schema.Literals([
  "backlog",
  "todo",
  "in_progress",
  "done",
  "canceled",
]);
export type WorkTaskStatus = typeof WorkTaskStatus.Type;
const title = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
const description = Schema.String.check(Schema.isMaxLength(64_000));
export const WorkTask = Schema.Struct({
  id: WorkTaskId,
  title,
  revision: Schema.Int.check(Schema.isGreaterThan(0)).pipe(
    Schema.withDecodingDefault(Effect.succeed(1)),
  ),
  description,
  status: WorkTaskStatus,
  parentTaskId: Schema.NullOr(WorkTaskId).pipe(Schema.withDecodingDefault(Effect.succeed(null))),
  projectId: Schema.NullOr(ProjectId),
  assigneeProjectId: Schema.NullOr(ProjectId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
  startedThreadId: Schema.NullOr(ThreadId),
  startError: Schema.NullOr(Schema.String),
});
export type WorkTask = typeof WorkTask.Type;
export const WorkTaskSummary = WorkTask.mapFields(({ description: _description, ...fields }) => ({
  ...fields,
  descriptionPreview: Schema.String.check(Schema.isMaxLength(512)),
}));
export type WorkTaskSummary = typeof WorkTaskSummary.Type;
export const WorkTaskListInput = Schema.Struct({});
export const WorkTaskListResult = Schema.Struct({ tasks: Schema.Array(WorkTaskSummary) });
export type WorkTaskListResult = typeof WorkTaskListResult.Type;
export const WorkTaskSaveInput = Schema.Struct({
  id: Schema.optional(WorkTaskId),
  expectedRevision: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  title: Schema.optional(title),
  description: Schema.optional(description),
  status: Schema.optional(WorkTaskStatus),
  parentTaskId: Schema.optional(Schema.NullOr(WorkTaskId)),
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  assigneeProjectId: Schema.optional(Schema.NullOr(ProjectId)),
});
export type WorkTaskSaveInput = typeof WorkTaskSaveInput.Type;
export const WorkTaskLookupInput = Schema.Struct({ id: WorkTaskId });
export type WorkTaskLookupInput = typeof WorkTaskLookupInput.Type;
export const WorkTaskMutationResult = Schema.Struct({ task: WorkTask });
export type WorkTaskMutationResult = typeof WorkTaskMutationResult.Type;
export const WorkTaskDeleteResult = Schema.Struct({ id: WorkTaskId });
export class WorkTaskError extends Schema.TaggedError<WorkTaskError>()("WorkTaskError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
