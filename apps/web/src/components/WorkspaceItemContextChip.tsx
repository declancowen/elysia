import { Link } from "@tanstack/react-router";
import { PageId, WorkTaskId, type EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Files01Icon, TaskEdit02Icon } from "../icons";
import { usePrimaryEnvironmentId } from "../state/environments";
import { ContextChip, ContextChipLabel } from "./ContextChip";
const isTaskId = Schema.is(WorkTaskId);
const isPageId = Schema.is(PageId);
export function WorkspaceItemContextChip({
  id,
  kind,
  label,
  environmentId,
  copyMarkdown,
}: {
  id: string;
  kind: "task" | "page";
  label: string;
  environmentId: EnvironmentId | null;
  copyMarkdown?: string;
}) {
  const primaryId = usePrimaryEnvironmentId();
  const valid = (kind === "task" ? isTaskId(id) : isPageId(id)) && primaryId === environmentId;
  return (
    <ContextChip
      kind="thread"
      render={
        valid ? (
          kind === "task" ? (
            <Link to="/tasks" search={{ task: id as WorkTaskId }} />
          ) : (
            <Link to="/pages/$pageId" params={{ pageId: id }} />
          )
        ) : (
          <span />
        )
      }
      aria-label={`${kind === "task" ? "Task" : "Page"}, ${label}`}
      data-markdown-copy={copyMarkdown}
    >
      {kind === "task" ? <TaskEdit02Icon /> : <Files01Icon />}
      <ContextChipLabel>{label}</ContextChipLabel>
    </ContextChip>
  );
}
