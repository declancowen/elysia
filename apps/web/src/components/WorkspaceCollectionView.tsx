import type { ReactNode } from "react";
import { Columns2Icon, BlocksIcon, ListIcon } from "../icons";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuRadioGroup, MenuRadioItem } from "./ui/menu";

export type CollectionView = "list" | "board" | "card";

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
        {view === "board" ? <Columns2Icon /> : view === "card" ? <BlocksIcon /> : <ListIcon />}
        {view === "card" ? "Cards" : view === "board" ? "Board" : "List"}
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup
          value={view}
          onValueChange={(value) => {
            if (value === "list" || value === "board" || value === "card") onChange(value);
          }}
        >
          <MenuRadioItem value="list">List</MenuRadioItem>
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

export function CollectionRows({ view, children }: { view: CollectionView; children: ReactNode }) {
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
