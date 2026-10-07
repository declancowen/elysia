import * as Schema from "effect/Schema";
import { ProjectId, ThreadId } from "./baseSchemas.ts";
import { WorkTaskId } from "./workTask.ts";
import { PageId } from "./page.ts";
export const WorkspaceChatTarget = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("task"), id: WorkTaskId }),
  Schema.Struct({ kind: Schema.Literal("page"), id: PageId }),
]);
export type WorkspaceChatTarget = typeof WorkspaceChatTarget.Type;
export const WorkspaceChatLinks = Schema.Struct({ threadIds: Schema.Array(ThreadId) });
export const WorkspaceChatLinkInput = Schema.Struct({
  target: WorkspaceChatTarget,
  threadId: ThreadId,
  linked: Schema.Boolean,
  // Reserve the association before a draft's first turn can create its thread.
  draftProjectId: Schema.optional(ProjectId),
});
export type WorkspaceChatLinkInput = typeof WorkspaceChatLinkInput.Type;
export class WorkspaceChatError extends Schema.TaggedError<WorkspaceChatError>()(
  "WorkspaceChatError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
