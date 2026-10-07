import { useId, useState, type ReactNode } from "react";
import { isElectron } from "~/env";
import { SearchIcon } from "~/icons";
import { SidebarChromeHeader, SidebarCommandShortcut } from "./SidebarChrome";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";

export function CollectionSidebarHeader({
  title,
  query,
  onQueryChange,
  actions,
}: {
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
  actions?: ReactNode;
}) {
  const searchId = useId();
  const [searchVisible, setSearchVisible] = useState(false);
  return (
    <>
      <SidebarChromeHeader
        isElectron={isElectron}
        title={title}
        search={
          <div className="flex items-center gap-1">
            <SidebarCommandShortcut />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Search ${title.toLowerCase()}`}
              aria-expanded={searchVisible}
              aria-controls={searchId}
              onClick={() => {
                setSearchVisible(!searchVisible);
                onQueryChange("");
              }}
            >
              <SearchIcon />
            </Button>
            {actions}
          </div>
        }
      />
      {searchVisible ? (
        <div id={searchId} className="shrink-0 px-3 pt-2 pb-4">
          <InputGroup variant="filled">
            <InputGroupAddon>
              <SearchIcon className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              autoFocus
              aria-label={`Search ${title.toLowerCase()}`}
              placeholder={`Search ${title.toLowerCase()}`}
              value={query}
              onValueChange={onQueryChange}
            />
          </InputGroup>
        </div>
      ) : null}
    </>
  );
}
