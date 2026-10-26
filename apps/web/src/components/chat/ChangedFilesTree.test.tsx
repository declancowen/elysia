import { RunId } from "@elysiatools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ChangedFilesCard } from "./ChangedFilesTree";

describe("ChangedFilesCard", () => {
  it("keeps its compact header sticky while preserving singular labels", () => {
    const markup = renderToStaticMarkup(
      <ChangedFilesCard
        runId={RunId.make("run-1")}
        files={[{ path: "README.md", kind: "modified", additions: 2, deletions: 1 }]}
        allDirectoriesExpanded
        resolvedTheme="light"
        onToggleAllDirectories={() => {}}
        onOpenTurnDiff={() => {}}
      />,
    );

    expect(markup).toContain('data-changed-files-state="tree"');
    expect(markup).toContain('aria-label="Open diff"');
    expect(markup).toContain('role="group" aria-label="2 additions, 1 deletions"');
    expect(markup).toContain("1 changed file");
    expect(markup).not.toContain("1 changed files");
  });

  it("shows collapsed folders and root files together", () => {
    const markup = renderToStaticMarkup(
      <ChangedFilesCard
        runId={RunId.make("run-1")}
        files={[
          { path: "apps/web/src/App.tsx", kind: "modified", additions: 120, deletions: 20 },
          { path: "apps/web/src/App.test.tsx", kind: "modified", additions: 30, deletions: 2 },
          {
            path: "packages/shared/src/git.ts",
            kind: "modified",
            additions: 15,
            deletions: 4,
          },
          { path: "README.md", kind: "modified", additions: 3, deletions: 0 },
        ]}
        allDirectoriesExpanded={false}
        resolvedTheme="light"
        onToggleAllDirectories={() => {}}
        onOpenTurnDiff={() => {}}
      />,
    );

    expect(markup).toContain('data-changed-files-state="tree"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("apps/web/src");
    expect(markup).not.toContain("App.tsx");
    expect(markup).toContain("packages/shared/src");
    expect(markup).not.toContain("git.ts");
    expect(markup).toContain("README.md");
    expect(markup).not.toContain("Show all");
    expect(markup).not.toContain("App.test.tsx");
  });

  it("keeps the folder tree visible when folders are collapsed", () => {
    const markup = renderToStaticMarkup(
      <ChangedFilesCard
        runId={RunId.make("run-1")}
        files={[{ path: "apps/web/src/App.tsx", kind: "modified", additions: 120, deletions: 20 }]}
        allDirectoriesExpanded={false}
        resolvedTheme="light"
        onToggleAllDirectories={() => {}}
        onOpenTurnDiff={() => {}}
      />,
    );

    expect(markup).toContain('data-changed-files-state="tree"');
    expect(markup).toContain("1 changed file");
    expect(markup).toContain("apps/web/src");
    expect(markup).not.toContain("Show all");
    expect(markup).not.toContain("App.tsx");
  });
});
