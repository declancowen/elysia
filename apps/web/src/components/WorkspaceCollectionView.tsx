import type { CSSProperties, ReactNode, Ref } from "react";
import {
  Columns2Icon,
  BlocksIcon,
  DashboardSquare02Icon,
  ListIcon,
  Table2,
  SlidersHorizontalIcon,
} from "../icons";
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
  MenuGroup,
  MenuGroupLabel,
} from "./ui/menu";

export type CollectionView = "list" | "board" | "card" | "table" | "wall";
export type CollectionProperty =
  | "status"
  | "project"
  | "parent"
  | "createdAt"
  | "updatedAt"
  | "completedAt";
export type CollectionColumn = {
  id: CollectionProperty | "title" | "agent" | "agentStatus" | "actions";
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
      <MenuPopup align="start">
        <MenuGroup>
          <MenuGroupLabel>Properties</MenuGroupLabel>
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
        </MenuGroup>
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
        <MenuPopup align="start">
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
  pages = false,
}: {
  view: CollectionView;
  onChange: (view: CollectionView) => void;
  pages?: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="compact" aria-label="View" />}>
        {view === "wall" ? (
          <DashboardSquare02Icon />
        ) : view === "board" ? (
          <Columns2Icon />
        ) : view === "card" ? (
          <BlocksIcon />
        ) : view === "table" ? (
          <Table2 />
        ) : (
          <ListIcon />
        )}
        {view === "wall"
          ? "Wall"
          : view === "card"
            ? "Cards"
            : view === "board"
              ? "Board"
              : view === "table"
                ? "Table"
                : "List"}
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>
          <MenuGroupLabel>View</MenuGroupLabel>
          <MenuRadioGroup
            value={view}
            onValueChange={(value) => {
              if (
                value === "list" ||
                value === "board" ||
                value === "card" ||
                value === "table" ||
                (pages && value === "wall")
              )
                onChange(value);
            }}
          >
            <MenuRadioItem value="list">List</MenuRadioItem>
            <MenuRadioItem value="table">Table</MenuRadioItem>
            <MenuRadioItem value="board">Board</MenuRadioItem>
            <MenuRadioItem value="card">Cards</MenuRadioItem>
            {pages ? (
              <>
                <MenuRadioItem value="wall">Wall</MenuRadioItem>
              </>
            ) : null}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

/** One remaining-height scroll area for both page and task collections. */
export function CollectionGroups({
  ref,
  view,
  children,
  columns,
}: {
  ref?: Ref<HTMLDivElement>;
  view: CollectionView;
  children: ReactNode;
  columns?: readonly CollectionColumn[];
}) {
  if (view === "table" && columns)
    return (
      <div ref={ref} className="min-h-0 flex-1 overflow-auto">
        <div role="table" style={tableStyle(columns)} className="flex flex-col gap-5">
          <CollectionTableHeader columns={columns} />
          {children}
        </div>
      </div>
    );
  return (
    <div
      ref={ref}
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
  header = true,
  cardSize = "medium",
  folderHeight,
  wallColumns = 5,
}: {
  view: CollectionView;
  children: ReactNode;
  columns: readonly CollectionColumn[];
  label: string;
  header?: boolean;
  cardSize?: CollectionCardSize;
  folderHeight?: number;
  wallColumns?: number;
}) {
  if (view === "table") {
    if (!header) return <div role="rowgroup">{children}</div>;
    return (
      <div role="table" aria-label={label} style={tableStyle(columns)}>
        <CollectionTableHeader columns={columns} />
        <div role="rowgroup">{children}</div>
      </div>
    );
  }
  return (
    <div
      style={
        {
          "--collection-wall-columns": wallColumns,
          "--collection-card-width": `${CARD_WIDTHS[cardSize]}px`,
          ...(folderHeight !== undefined
            ? { gridAutoRows: view === "card" ? folderHeight : undefined }
            : {}),
        } as CSSProperties
      }
      className={
        view === "wall"
          ? "grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(var(--collection-wall-columns),minmax(0,1fr))] [&>*]:overflow-hidden"
          : view === "card"
            ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--collection-card-width)),1fr))] items-start gap-4 [&>*]:overflow-hidden"
            : "flex flex-col gap-2"
      }
    >
      {children}
    </div>
  );
}

export type CollectionCardSize = "small" | "medium" | "large";
export const CARD_WIDTHS = { small: 220, medium: 288, large: 360 } as const;

export function CollectionCardSizePicker({
  value,
  onChange,
}: {
  value: CollectionCardSize;
  onChange: (size: CollectionCardSize) => void;
}) {
  return (
    <MenuGroup>
      <MenuGroupLabel>Card size</MenuGroupLabel>
      <MenuRadioGroup
        value={value}
        onValueChange={(size) => {
          if (size === "small" || size === "medium" || size === "large") onChange(size);
        }}
      >
        <MenuRadioItem value="small" closeOnClick={false}>
          Small
        </MenuRadioItem>
        <MenuRadioItem value="medium" closeOnClick={false}>
          Medium
        </MenuRadioItem>
        <MenuRadioItem value="large" closeOnClick={false}>
          Large
        </MenuRadioItem>
      </MenuRadioGroup>
    </MenuGroup>
  );
}

function tableStyle(columns: readonly CollectionColumn[]): CSSProperties {
  const width = (column: CollectionColumn) =>
    column.id === "title" ? 220 : column.id === "actions" ? 64 : 160;
  return {
    minWidth: columns.reduce((sum, column) => sum + width(column), 24 + (columns.length - 1) * 12),
    "--collection-columns": columns
      .map((column) => (column.id === "title" ? "minmax(220px,1fr)" : `${width(column)}px`))
      .join(" "),
  } as CSSProperties;
}

function CollectionTableHeader({ columns }: { columns: readonly CollectionColumn[] }) {
  return (
    <div
      role="row"
      className="sticky top-0 z-10 grid grid-cols-[var(--collection-columns)] items-center gap-3 border-b border-border bg-background px-3 py-2 text-xs text-muted-foreground"
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
  );
}
