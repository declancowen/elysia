import { use, useId, useRef, useState } from "react";
import type { EnvironmentId } from "@elysiatools/contracts";
import type { EnvironmentProject } from "@elysiatools/client-runtime/state/shell";
import { formatAgentMention } from "@elysiatools/shared/agentMentions";
import {
  collapseExpandedComposerCursor,
  detectComposerTrigger,
  replaceTextRange,
} from "../../composer-logic";
import { useTheme } from "../../hooks/useTheme";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import {
  ComposerContextActionsContext,
  EMPTY_COMPOSER_CONTEXT_RECORDS,
} from "../composerContextPresentation";
import {
  ComposerCommandMenu,
  composerSuggestionOptionId,
  type ComposerCommandItem,
} from "../chat/ComposerCommandMenu";
import { useComposerTriggerState } from "../chat/useComposerTriggerState";

export function ScheduledTaskPrompt({
  environmentId,
  project,
  projects,
  value,
  disabled,
  onChange,
}: {
  environmentId: EnvironmentId;
  project: EnvironmentProject | null;
  projects: readonly EnvironmentProject[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const [cursor, setCursor] = useState(() => collapseExpandedComposerCursor(value, value.length));
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const { trigger, setTrigger, dismissTrigger } = useComposerTriggerState(() => null);
  const contextActions = use(ComposerContextActionsContext);
  const { resolvedTheme } = useTheme();
  const listId = useId();
  const group = project?.agentProfile?.group;
  const mentions = projects.filter(
    (candidate) =>
      candidate.environmentId === environmentId &&
      candidate.agentProfile &&
      !candidate.agentProfile.archived &&
      (!group || group.memberProjectIds.includes(candidate.id)),
  );
  const items: ComposerCommandItem[] =
    trigger?.kind === "path"
      ? mentions
          .filter((candidate) =>
            candidate.title.toLowerCase().includes(trigger.query.toLowerCase()),
          )
          .map((candidate) => ({
            id: candidate.id,
            type: "agent",
            projectId: candidate.id,
            avatar: candidate.agentProfile!.avatar,
            isGroup: Boolean(candidate.agentProfile?.group),
            label: candidate.title,
            description: candidate.agentProfile?.group ? "Channel" : "Agent",
          }))
      : [];
  const activeItem = items.find((item) => item.id === highlighted) ?? items[0];
  const insertMention = (target: EnvironmentProject) => {
    if (disabled) return;
    const snapshot = editorRef.current?.readSnapshot();
    const source = snapshot?.value ?? value;
    const caret = snapshot?.expandedCursor ?? source.length;
    const currentTrigger = detectComposerTrigger(source, caret);
    const range = currentTrigger?.kind === "path" ? currentTrigger : null;
    const next = replaceTextRange(
      source,
      range?.rangeStart ?? caret,
      range?.rangeEnd ?? caret,
      `${formatAgentMention(target.id, target.title)} `,
    );
    const nextCursor = collapseExpandedComposerCursor(next.text, next.cursor);
    onChange(next.text);
    setCursor(nextCursor);
    setTrigger(null);
    setHighlighted(null);
    requestAnimationFrame(() => editorRef.current?.focusAt(nextCursor));
  };
  const selectItem = (item: ComposerCommandItem) => {
    const target = mentions.find((candidate) => candidate.id === item.id);
    if (target) insertMention(target);
  };
  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) dismissTrigger(trigger);
      }}
    >
      <ComposerContextActionsContext value={{ ...contextActions, environmentId }}>
        <ComposerPromptEditor
          editorRef={editorRef}
          value={value}
          cursor={cursor}
          contextRecords={EMPTY_COMPOSER_CONTEXT_RECORDS}
          skills={[]}
          disabled={disabled}
          placeholder="What should the agent do each time this runs? Type @ to mention an agent or channel."
          ariaLabel="Scheduled task prompt"
          suggestionListId={listId}
          activeSuggestionId={
            !disabled && activeItem ? composerSuggestionOptionId(listId, activeItem.id) : undefined
          }
          containerClassName="rounded-lg border border-input bg-background p-3 shadow-xs/5"
          className="min-h-24 max-h-64 overflow-y-auto outline-none"
          onChange={(text, nextCursor, expandedCursor, adjacent) => {
            onChange(text);
            setCursor(nextCursor);
            setTrigger(adjacent ? null : detectComposerTrigger(text, expandedCursor));
            setHighlighted(null);
          }}
          onCommandKeyDown={(key, event) => {
            if (trigger?.kind !== "path") return false;
            if (key === "Escape") {
              event.preventDefault();
              dismissTrigger(trigger);
              return true;
            }
            if (!activeItem) return false;
            if (key === "ArrowUp" || key === "ArrowDown") {
              event.preventDefault();
              const index = items.indexOf(activeItem);
              setHighlighted(
                items[(index + (key === "ArrowDown" ? 1 : -1) + items.length) % items.length]!.id,
              );
              return true;
            }
            if (key === "Enter" || key === "Tab") {
              event.preventDefault();
              selectItem(activeItem);
              return true;
            }
            return false;
          }}
          onPaste={() => {}}
        />
      </ComposerContextActionsContext>
      {!disabled && trigger?.kind === "path" ? (
        <ComposerCommandMenu
          listId={listId}
          items={items}
          resolvedTheme={resolvedTheme}
          isLoading={false}
          triggerKind="path"
          emptyStateText="No matching agents or channels."
          activeItemId={activeItem?.id ?? null}
          onHighlightedItemChange={setHighlighted}
          onSelect={selectItem}
        />
      ) : null}
    </div>
  );
}
