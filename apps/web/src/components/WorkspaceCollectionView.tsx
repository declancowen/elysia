import type { CSSProperties, ReactNode } from "react";
import { Columns2Icon, BlocksIcon, ListIcon, Table2, SlidersHorizontalIcon } from "../icons";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuCheckboxItem,
} from "./ui/menu";

export type CollectionView = "list" | "board" | "card" | "table";
export type CollectionProperty = "status" | "project" | "parent" | "createdAt" | "updatedAt";
export type CollectionColumn = {
  id: CollectionProperty | "title" | "agent" | "actions";
  label: string;
};

export function CollectionPropertiesPicker({
  options,
  value,
  onChange,
}: {
  options: readonly { id: CollectionProperty; label: string }[];
  value: readonly CollectionProperty[];
  onChange: (value: CollectionProperty[]) => void;
}) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="compact" aria-label="Properties" />}>
        <SlidersHorizontalIcon />
        Properties
      </MenuTrigger>
      <MenuPopup align="end">
        {options.map((option) => (
          <MenuCheckboxItem
            key={option.id}
            checked={value.includes(option.id)}
            closeOnClick={false}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, option.id] : value.filter((id) => id !== option.id))
            }
          >
            {option.label}
          </MenuCheckboxItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

/** Editable metadata stays separate from opening or dragging a collection item. */
export function CollectionPropertyPill({
  label,
  value,
  options,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: ReactNode }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <Menu>
        <MenuTrigger
          disabled={disabled}
          render={<Badge variant="outline" render={<button type="button" />} />}
          aria-label={label}
        >
          <span className="max-w-32 truncate">{children}</span>
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuRadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => (
              <MenuRadioItem key={option.value} value={option.value} closeOnClick>
                {option.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>
    </span>
  );
}

export function CollectionViewPicker({
  view,
  onChange,
}: {
  view: CollectionView;
  onChange: (view: CollectionView) => void;
}) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="compact" aria-label="View" />}>
        {view === "board" ? (
          <Columns2Icon />
        ) : view === "card" ? (
          <BlocksIcon />
        ) : view === "table" ? (
          <Table2 />
        ) : (
          <ListIcon />
        )}
        {view === "card"
          ? "Cards"
          : view === "board"
            ? "Board"
            : view === "table"
              ? "Table"
              : "List"}
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup
          value={view}
          onValueChange={(value) => {
            if (value === "list" || value === "board" || value === "card" || value === "table")
              onChange(value);
          }}
        >
          <MenuRadioItem value="list">List</MenuRadioItem>
          <MenuRadioItem value="table">Table</MenuRadioItem>
          <MenuRadioItem value="board">Board</MenuRadioItem>
          <MenuRadioItem value="card">Cards</MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/** One remaining-height scroll area for both page and task collections. */
export function CollectionGroups({
  view,
  children,
}: {
  view: CollectionView;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-auto",
        view === "board" ? "flex items-start gap-4 pb-4" : "flex flex-col gap-5",
      )}
    >
      {children}
    </div>
  );
}

export function CollectionTableCell({
  view,
  children,
  align = "right",
}: {
  view: CollectionView;
  children: ReactNode;
  align?: "left" | "right";
}) {
  return view === "table" ? (
    <div
      role="cell"
      className={cn("flex min-w-0 items-center", align === "right" && "justify-end")}
    >
      {children ?? <span className="text-muted-foreground">—</span>}
    </div>
  ) : (
    children
  );
}

export function CollectionRows({
  view,
  children,
  columns,
  label,
}: {
  view: CollectionView;
  children: ReactNode;
  columns: readonly CollectionColumn[];
  label: string;
}) {
  if (view === "table") {
    const width = (column: CollectionColumn) =>
      column.id === "title"
        ? 220
        : column.id === "agent"
          ? 260
          : column.id === "actions"
            ? 64
            : 160;
    return (
      <div
        role="table"
        aria-label={label}
        style={
          {
            minWidth: columns.reduce(
              (sum, column) => sum + width(column),
              24 + (columns.length - 1) * 12,
            ),
            "--collection-columns": columns
              .map((column) => (column.id === "title" ? "minmax(220px,1fr)" : `${width(column)}px`))
              .join(" "),
          } as CSSProperties
        }
      >
        <div
          role="row"
          className="grid grid-cols-[var(--collection-columns)] items-center gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground"
        >
          {columns.map((column) => (
            <div
              role="columnheader"
              key={column.id}
              className={cn(column.id !== "title" && column.id !== "agent" && "text-right")}
            >
              {column.label}
            </div>
          ))}
        </div>
        <div role="rowgroup">{children}</div>
      </div>
    );
  }
  return (
    <div
      className={
        view === "card"
          ? "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-start gap-4"
          : "flex flex-col gap-2"
      }
    >
      {children}
    </div>
  );
}
