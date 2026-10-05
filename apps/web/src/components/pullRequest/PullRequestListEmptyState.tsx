import { RefreshIcon } from "~/components/ui/refresh-icon";
import { PlusIcon, SearchIcon } from "~/icons";

import { openCommandPalette } from "../../commandPaletteBus";
import { Button } from "../ui/button";
import { PullRequestGlyph } from "./pullRequestIcons";
import { PullRequestListGhost } from "./PullRequestGhosts";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";

export function PullRequestListEmptyState({
  query,
  filtered,
  searching,
  hasProjects,
  canLoadMore,
  loadingMore,
  refreshing,
  onClearQuery,
  onLoadMore,
  onRefresh,
}: {
  /** The text being searched for, so the reader is told what was searched rather than guessing. */
  query: string;
  /** True when a state, involvement or project filter is narrowing the list. */
  filtered: boolean;
  /** A search is in flight; the rows on screen are the previous answer. */
  searching: boolean;
  /**
   * Whether this environment holds a project at all. The list is assembled from the projects'
   * remotes, so without one there is no host to ask and no filter or search that could help.
   */
  hasProjects: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  /** A re-read of the hosts is already running, from here or from the header. */
  refreshing: boolean;
  onClearQuery: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  // Ahead of the search and the filters, because neither can produce a row until a project does.
  if (!hasProjects) {
    return (
      <Empty>
        <PullRequestGlyph.pullRequest aria-hidden className="size-16 text-muted-foreground" />
        <EmptyHeader>
          <EmptyTitle>No projects in this workspace</EmptyTitle>
          <EmptyDescription>
            Add a project, and the pull requests from its repository appear here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={() => openCommandPalette({ open: "add-project" })}>
            <PlusIcon className="size-3.5" />
            Add project
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (searching) {
    // The same ghost the first load wears, so a search on its way and a list on its way are
    // one state to the eye — with the question named where the group headers usually speak.
    return (
      <PullRequestListGhost
        rows={5}
        caption={`Searching every host for “${query.length > 48 ? `${query.slice(0, 48)}…` : query}”`}
      />
    );
  }

  if (query.length > 0) {
    return (
      <Empty>
        <PullRequestGlyph.pullRequest aria-hidden className="size-16 text-muted-foreground" />
        <EmptyHeader>
          {/* A pasted paragraph is still a search, but it is not a title. */}
          <EmptyTitle>
            Nothing matches “{query.length > 48 ? `${query.slice(0, 48)}…` : query}”
          </EmptyTitle>
          <EmptyDescription>
            The hosts were searched for it. Try fewer words, or search by number, author or branch.
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="outline" onClick={onClearQuery}>
            <SearchIcon className="size-3.5" />
            Clear search
          </Button>
          {/* The hosts answered this query once; a pull request opened since then would answer
              differently, and nothing on screen says which of the two the reader is looking at. */}
          <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
            <RefreshIcon size="sm" refreshing={refreshing} />
            {refreshing ? "Checking..." : "Check again"}
          </Button>
        </div>
      </Empty>
    );
  }

  return (
    <Empty>
      <PullRequestGlyph.pullRequest aria-hidden className="size-16 text-muted-foreground" />
      <EmptyHeader>
        <EmptyTitle>{filtered ? "Nothing under these filters" : "No pull requests"}</EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "Widen the state, involvement or project filter to see more."
            : "Pull requests from every project in this workspace appear here."}
        </EmptyDescription>
      </EmptyHeader>
      <div className="flex flex-wrap justify-center gap-2">
        {canLoadMore ? (
          <Button size="sm" variant="outline" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "Loading..." : "Load more pull requests"}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
          <RefreshIcon size="sm" refreshing={refreshing} />
          {refreshing ? "Checking..." : "Check again"}
        </Button>
      </div>
    </Empty>
  );
}
