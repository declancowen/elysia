import type { PullRequestCheck } from "@elysiatools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  pullRequestChecksState,
  pullRequestCheckStatusLabel,
  summarizePullRequestChecks,
} from "./pullRequestPresentation";

function check(
  status: PullRequestCheck["status"],
  overrides: Partial<PullRequestCheck> = {},
): PullRequestCheck {
  return { name: `check-${status}`, status, description: null, url: null, ...overrides };
}

describe("pullRequestChecksState", () => {
  it("lets a failure outrank a run still going, and reports nothing without checks", () => {
    expect(pullRequestChecksState([check("success"), check("pending"), check("failure")])).toBe(
      "failing",
    );
    expect(pullRequestChecksState([check("success"), check("cancelled")])).toBe("failing");
    expect(pullRequestChecksState([check("success"), check("pending")])).toBe("pending");
    expect(pullRequestChecksState([check("success"), check("action-required")])).toBe("pending");
    expect(pullRequestChecksState([check("success")])).toBe("passing");
    expect(pullRequestChecksState([check("skipped"), check("neutral")])).toBe(null);
    expect(pullRequestChecksState([])).toBe(null);
  });

  it("names workflow approval instead of claiming every check passed", () => {
    const workflow = check("action-required", {
      url: "https://github.com/acme/web/actions/runs/42/job/7",
    });
    const manualGate = check("action-required", { url: "https://example.com/manual-gate" });
    expect(pullRequestCheckStatusLabel(workflow)).toBe("Awaiting approval");
    expect(pullRequestCheckStatusLabel(manualGate)).toBe("Awaiting action");
    expect(summarizePullRequestChecks([check("success"), workflow])).toBe(
      "1 workflow awaiting approval",
    );
    expect(summarizePullRequestChecks([check("failure"), workflow])).toBe("1 of 2 failing");
    expect(summarizePullRequestChecks([check("success"), manualGate])).toBe(
      "1 check awaiting action",
    );
    expect(summarizePullRequestChecks([workflow, manualGate])).toBe(
      "1 workflow and 1 check awaiting action",
    );
  });
});
