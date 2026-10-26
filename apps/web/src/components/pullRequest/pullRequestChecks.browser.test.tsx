import { act, render as renderUi } from "../../../test/render";
import { EnvironmentId, ProjectId, SourceControlProviderKind } from "@elysiatools/contracts";
import { expect, it, vi } from "vite-plus/test";

import type { EnvironmentPullRequestEntry } from "./pullRequestList.logic";
import { PullRequestRow } from "./PullRequestRow";

vi.mock(import("~/state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({
    data: {
      checks: [{ name: "Unit tests", status: "failure", description: null, url: null }],
    },
    error: null,
    isPending: false,
  })) as never,
}));
vi.mock(import("~/browser/useOpenLink"), async (original) => ({
  ...(await original()),
  useOpenLink: () => vi.fn(),
}));

const entry: EnvironmentPullRequestEntry = {
  environmentId: EnvironmentId.make("env-1"),
  projectId: ProjectId.make("project-1"),
  projectTitle: "Web",
  provider: SourceControlProviderKind.make("github"),
  host: "github.com",
  repository: "acme/web",
  number: 1,
  title: "Add the pull requests page",
  url: "https://github.com/acme/web/pull/1",
  author: null,
  headBranch: "feat/page",
  baseBranch: "main",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 0,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-02T00:00:00Z",
  viewerReviewRequested: false,
  labels: [],
};

it("opens reported checks without selecting the row and omits the control without a rollup", async () => {
  const onSelect = vi.fn();
  const render = (withRollup: boolean) => (
    <PullRequestRow
      entry={withRollup ? { ...entry, checksState: "failing" } : entry}
      selected={false}
      showProjectTitle={false}
      showProvider={false}
      onSelect={onSelect}
      hostActions={new Set()}
      onActed={vi.fn()}
    />
  );
  await using root = await renderUi(render(true));
  const { container } = root;
  const checks = container.querySelector<HTMLElement>(
    '[aria-label="Checks: Some checks were not successful"]',
  )!;
  expect(checks).not.toBeNull();
  await act(async () => checks.click());
  await vi.waitFor(() => expect(document.body.textContent).toContain("Unit tests"));
  expect(onSelect).not.toHaveBeenCalled();

  await act(async () => root.rerender(render(false)));
  expect(container.querySelector('[aria-label^="Checks:"]')).toBeNull();
});
