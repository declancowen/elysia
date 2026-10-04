import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { createContext, use, type ReactNode } from "react";
import { cn } from "../../lib/utils";

/** Reordering changes presentation only; callers retain project/thread ownership. */
export function SidebarOrderedList({
  ids,
  onReorder,
  children,
  layout = "list",
}: {
  layout?: "list" | "grid";
  ids: string[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={
        layout === "grid"
          ? [restrictToFirstScrollableAncestor]
          : [restrictToVerticalAxis, restrictToFirstScrollableAncestor]
      }
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to));
      }}
    >
      <SortableContext
        items={ids}
        strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}
const SidebarRowDragContext = createContext<ReturnType<typeof useSortable> | null>(null);

export function useSidebarRowDrag() {
  return use(SidebarRowDragContext);
}

export function SidebarSectionDragLabel({
  label,
  expanded,
  onClick,
  className,
  children,
}: {
  label: string;
  expanded?: boolean;
  onClick?: () => void;
  className: string;
  children?: ReactNode;
}) {
  const drag = useSidebarRowDrag();
  return (
    <button
      type="button"
      ref={drag?.setActivatorNodeRef}
      {...drag?.attributes}
      {...drag?.listeners}
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
      data-sidebar-sortable={drag ? "" : undefined}
      data-sidebar-dragging={drag?.isDragging ? "" : undefined}
      className={cn(
        className,
        "hover:bg-sidebar-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        drag && "touch-none",
        drag?.isDragging && "bg-sidebar-row-hover",
      )}
    >
      {children ?? label}
    </button>
  );
}

export function SidebarOrderedRow({
  id,
  children,
  disabled = false,
  className,
}: {
  className?: string;
  id: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const sortable = useSortable({
    id,
    disabled,
  });
  const { setNodeRef, transform, transition, isDragging } = sortable;
  return (
    <SidebarRowDragContext value={sortable}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className={cn(
          "relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging && "z-30",
          className,
        )}
        role="listitem"
      >
        {children}
      </div>
    </SidebarRowDragContext>
  );
}
