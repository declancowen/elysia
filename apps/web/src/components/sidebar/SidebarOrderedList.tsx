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
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { createContext, use, type ReactNode } from "react";
import { Button } from "../ui/button";
import { GripVerticalIcon } from "../../icons";
import { cn } from "../../lib/utils";

/** Reordering changes presentation only; callers retain project/thread ownership. */
export function SidebarOrderedList({
  ids,
  onReorder,
  children,
}: {
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
      modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to));
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
const SectionDragContext = createContext<ReturnType<typeof useSortable> | null>(null);

export function SidebarSectionDragHandle({ label }: { label: string }) {
  const drag = use(SectionDragContext);
  if (!drag) return null;
  return (
    <Button
      ref={drag.setActivatorNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      variant="ghost"
      size="icon-xs"
      aria-label={`Reorder ${label} section`}
      data-sidebar-sortable
    >
      <GripVerticalIcon />
    </Button>
  );
}

export function SidebarOrderedRow({
  id,
  children,
  disabled = false,
}: {
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
    <SectionDragContext value={sortable}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className={cn(
          "relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging && "z-30 bg-sidebar-control-surface shadow-lg opacity-90",
        )}
        role="listitem"
      >
        {children}
      </div>
    </SectionDragContext>
  );
}
