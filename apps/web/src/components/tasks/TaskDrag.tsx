import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ReactNode, MouseEventHandler } from "react";
import type { WorkTaskSummary } from "@t3tools/contracts";
import type { TaskGroup } from "./taskViews";
import { cn } from "../../lib/utils";
export function TaskDragRow({
  task,
  depth = 0,
  className,
  children,
  onContextMenu,
  table = false,
}: {
  task: WorkTaskSummary;
  depth?: number;
  className: string;
  children: ReactNode;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  table?: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role={table ? "row" : attributes.role}
      onContextMenu={onContextMenu}
      style={{
        touchAction: "none",
        marginInlineStart: depth * 24,
      }}
      className={cn(className, isDragging && "opacity-0")}
    >
      {children}
    </div>
  );
}
export function TaskDropGroup({
  id,
  drop,
  className,
  children,
}: {
  id: string;
  drop: TaskGroup["drop"];
  className: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { drop },
    disabled: !Object.keys(drop).length,
  });
  return (
    <section ref={setNodeRef} className={cn(className, isOver && "bg-muted/30")}>
      {children}
    </section>
  );
}
