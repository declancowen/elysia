import { Link } from "@tanstack/react-router";
import {
  PageId,
  WorkTaskId,
  ProjectId,
  ScheduledTaskId,
  type EnvironmentId,
} from "@elysiatools/contracts";
import * as Schema from "effect/Schema";
import { Files01Icon, TaskEdit02Icon, FolderIcon, ClockIcon } from "../icons";
import { usePrimaryEnvironmentId } from "../state/environments";
import { ContextChip, ContextChipLabel } from "./ContextChip";
const isTaskId = Schema.is(WorkTaskId);
const isPageId = Schema.is(PageId);
const isProjectId = Schema.is(ProjectId);
const isScheduledTaskId = Schema.is(ScheduledTaskId);
export function WorkspaceItemContextChip({
  id,
  kind,
  label,
  environmentId,
  copyMarkdown,
}: {
  id: string;
  kind: "task" | "page" | "project" | "scheduled";
  label: string;
  environmentId: EnvironmentId | null;
  copyMarkdown?: string;
}) {
  const primaryId = usePrimaryEnvironmentId();
  const valid =
    (kind === "task"
      ? isTaskId(id)
      : kind === "page"
        ? isPageId(id)
        : kind === "project"
          ? isProjectId(id)
          : isScheduledTaskId(id)) && primaryId === environmentId;
  return (
    <ContextChip
      kind="thread"
      render={
        valid ? (
          kind === "task" ? (
            <Link to="/tasks" search={{ task: id as WorkTaskId }} />
          ) : kind === "scheduled" ? (
            <Link
              to="/settings/scheduled-tasks"
              search={{ environmentId: environmentId!, taskId: id as ScheduledTaskId }}
            />
          ) : kind === "project" ? (
            <Link to="/projects" />
          ) : (
            <Link to="/pages/$pageId" params={{ pageId: id }} />
          )
        ) : (
          <span />
        )
      }
      aria-label={`${kind}, ${label}`}
      data-markdown-copy={copyMarkdown}
    >
      {kind === "task" ? (
        <TaskEdit02Icon />
      ) : kind === "page" ? (
        <Files01Icon />
      ) : kind === "project" ? (
        <FolderIcon />
      ) : (
        <ClockIcon />
      )}
      <ContextChipLabel>{label}</ContextChipLabel>
    </ContextChip>
  );
}
