import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
}: {
  task: WorkTaskSummary;
  depth?: number;
  className: string;
  children: ReactNode;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
}) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onContextMenu={onContextMenu}
      style={{
        transform: CSS.Translate.toString(transform),
        touchAction: "none",
        marginInlineStart: depth * 24,
      }}
      className={cn(className, isDragging && "relative z-20")}
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
