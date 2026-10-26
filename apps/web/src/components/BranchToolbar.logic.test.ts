import { EnvironmentId } from "@elysiatools/contracts";
import {
  resolvePreviousWorktreeSeed,
  resolvePreviousWorktreeLabel,
  resolveEnvironmentOptionLabel,
  shouldShowEnvironmentIndicator,
  shouldShowComposerContextStrip,
} from "./BranchToolbar.logic";
import { type VcsRef } from "@elysiatools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  dedupeRemoteBranchesWithLocalMatches,
  deriveLocalBranchNameFromRemoteRef,
  resolveBranchSelectionTarget,
  resolveDraftEnvModeAfterBranchChange,
  resolveEffectiveEnvMode,
  resolveBranchToolbarPrBranch,
  resolveLocalCheckoutBranchMismatch,
  sanitizeNewRefName,
  shouldIncludeBranchPickerItem,
} from "./BranchToolbar.logic";

const localEnvironmentId = EnvironmentId.make("environment-local");
const remoteEnvironmentId = EnvironmentId.make("environment-remote");

describe("resolvePreviousWorktreeSeed", () => {
  it("picks the most recently updated worktree thread", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "elysia/older",
            worktreePath: "/repo/.t3/worktrees/older",
            updatedAt: "2026-07-20T00:00:00.000Z",
          },
          {
            branch: "elysia/newer",
            worktreePath: "/repo/.t3/worktrees/newer",
            updatedAt: "2026-07-22T00:00:00.000Z",
          },
          { branch: "main", worktreePath: null, updatedAt: "2026-07-23T00:00:00.000Z" },
        ],
        currentWorktreePath: null,
      }),
    ).toEqual({ branch: "elysia/newer", worktreePath: "/repo/.t3/worktrees/newer" });
  });

  it("skips the worktree the composer already points at", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "elysia/current",
            worktreePath: "/repo/.t3/worktrees/current",
            updatedAt: "2026-07-22T00:00:00.000Z",
          },
        ],
        currentWorktreePath: "/repo/.t3/worktrees/current",
      }),
    ).toBeNull();
  });

  it("returns null when no thread has a worktree", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [{ branch: "main", worktreePath: null, updatedAt: "2026-07-22T00:00:00.000Z" }],
        currentWorktreePath: null,
      }),
    ).toBeNull();
  });

  it("ignores archived threads and threads with unparseable timestamps", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "elysia/archived",
            worktreePath: "/repo/.t3/worktrees/archived",
            updatedAt: "2026-07-23T00:00:00.000Z",
            archivedAt: "2026-07-23T01:00:00.000Z",
          },
          {
            branch: "elysia/garbage-timestamp",
            worktreePath: "/repo/.t3/worktrees/garbage",
            updatedAt: "not-a-date",
          },
          {
            branch: "elysia/live",
            worktreePath: "/repo/.t3/worktrees/live",
            updatedAt: "2026-07-21T00:00:00.000Z",
            archivedAt: null,
          },
        ],
        currentWorktreePath: null,
      }),
    ).toEqual({ branch: "elysia/live", worktreePath: "/repo/.t3/worktrees/live" });
  });
});

describe("resolvePreviousWorktreeLabel", () => {
  it("includes the branch when known", () => {
    expect(resolvePreviousWorktreeLabel({ branch: "elysia/fix-thing", worktreePath: "/wt" })).toBe(
      "Previous worktree (elysia/fix-thing)",
    );
    expect(resolvePreviousWorktreeLabel({ branch: null, worktreePath: "/wt" })).toBe(
      "Previous worktree",
    );
  });
});

describe("resolveDraftEnvModeAfterBranchChange", () => {
  it("switches to local mode when returning from an existing worktree to the main worktree", () => {
    expect(
      resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: null,
        currentWorktreePath: "/repo/.t3/worktrees/feature-a",
        effectiveEnvMode: "worktree",
      }),
    ).toBe("local");
  });

  it("uses worktree mode when selecting a ref already attached to a worktree", () => {
    expect(
      resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: "/repo/.t3/worktrees/feature-a",
        currentWorktreePath: null,
        effectiveEnvMode: "local",
      }),
    ).toBe("worktree");
  });
});

describe("resolveBranchToolbarPrBranch", () => {
  it("hides PR state while an optimistic branch switch is in flight", () => {
    expect(
      resolveBranchToolbarPrBranch({
        activeThreadBranch: "feature/current",
        resolvedActiveBranch: "feature/next",
      }),
    ).toBeNull();
  });
});

describe("resolveLocalCheckoutBranchMismatch", () => {
  it("detects when a local thread is associated with a different branch than the checkout", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        effectiveEnvMode: "local",
        activeWorktreePath: null,
        activeThreadBranch: "feature/thread",
        currentGitBranch: "feature/current",
      }),
    ).toEqual({
      threadBranch: "feature/thread",
      currentBranch: "feature/current",
    });
  });

  it("ignores dedicated worktrees because their checkout is already thread-scoped", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        effectiveEnvMode: "worktree",
        activeWorktreePath: "/repo/.t3/worktrees/feature-thread",
        activeThreadBranch: "feature/thread",
        currentGitBranch: "feature/current",
      }),
    ).toBeNull();
  });

  it("ignores new-worktree base selection before a worktree exists", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        effectiveEnvMode: "worktree",
        activeWorktreePath: null,
        activeThreadBranch: "feature/base",
        currentGitBranch: "main",
      }),
    ).toBeNull();
  });
});

describe("resolveEnvironmentOptionLabel", () => {
  it("prefers the primary environment's machine label", () => {
    expect(
      resolveEnvironmentOptionLabel({
        isPrimary: true,
        environmentId: localEnvironmentId,
        runtimeLabel: "Julius's Mac mini",
        savedLabel: "Local environment",
      }),
    ).toBe("Julius's Mac mini");
  });

  it("falls back to 'This device' for generic primary labels", () => {
    expect(
      resolveEnvironmentOptionLabel({
        isPrimary: true,
        environmentId: localEnvironmentId,
        runtimeLabel: "Local environment",
        savedLabel: "Local",
      }),
    ).toBe("This device");
  });

  it("keeps configured labels for non-primary environments", () => {
    expect(
      resolveEnvironmentOptionLabel({
        isPrimary: false,
        environmentId: remoteEnvironmentId,
        runtimeLabel: null,
        savedLabel: "Build box",
      }),
    ).toBe("Build box");
  });
});

describe("shouldShowEnvironmentIndicator", () => {
  it("shows the indicator whenever multiple environments are pickable", () => {
    expect(
      shouldShowEnvironmentIndicator({
        activeEnvironment: { isPrimary: true },
        canPickEnvironment: true,
      }),
    ).toBe(true);
  });

  it("shows a sole remote environment so the user knows where the project runs", () => {
    expect(
      shouldShowEnvironmentIndicator({
        activeEnvironment: { isPrimary: false },
        canPickEnvironment: false,
      }),
    ).toBe(true);
  });

  it("hides a sole primary (this-device) environment", () => {
    expect(
      shouldShowEnvironmentIndicator({
        activeEnvironment: { isPrimary: true },
        canPickEnvironment: false,
      }),
    ).toBe(false);
  });

  it("hides the indicator when the active environment is unknown", () => {
    expect(
      shouldShowEnvironmentIndicator({
        activeEnvironment: null,
        canPickEnvironment: false,
      }),
    ).toBe(false);
  });
});

describe("shouldShowComposerContextStrip", () => {
  it("keeps a sole primary server update reachable in a non-Git draft", () => {
    const environment = {
      activeEnvironment: { isPrimary: true },
      canPickEnvironment: false,
      serverUpdateAvailable: true,
    };
    const showEnvironmentIndicator = shouldShowEnvironmentIndicator(environment);
    expect(showEnvironmentIndicator).toBe(true);
    expect(
      shouldShowComposerContextStrip({
        isDraftHeroState: true,
        persistInActiveThreads: false,
        hasActiveProject: true,
        showGitControls: false,
        showEnvironmentIndicator,
        hostsRestingComposerControls: false,
      }),
    ).toBe(true);
    expect(
      shouldShowComposerContextStrip({
        isDraftHeroState: false,
        persistInActiveThreads: false,
        hasActiveProject: true,
        showGitControls: false,
        showEnvironmentIndicator,
        hostsRestingComposerControls: false,
      }),
    ).toBe(true);
  });

  it.each([false, true])(
    "honors the active-thread preference with resting controls %s",
    (hostsRestingComposerControls) => {
      const input = {
        isDraftHeroState: false,
        hasActiveProject: true,
        showGitControls: true,
        showEnvironmentIndicator: true,
        hostsRestingComposerControls,
      };
      expect(shouldShowComposerContextStrip({ ...input, persistInActiveThreads: false })).toBe(
        false,
      );
      expect(shouldShowComposerContextStrip({ ...input, persistInActiveThreads: true })).toBe(true);
    },
  );

  it("keeps the environment indicator visible for a non-Git project", () => {
    expect(
      shouldShowComposerContextStrip({
        isDraftHeroState: true,
        persistInActiveThreads: false,
        hasActiveProject: true,
        showGitControls: false,
        showEnvironmentIndicator: true,
        hostsRestingComposerControls: false,
      }),
    ).toBe(true);
  });

  it("hides the strip when a non-Git project has nothing to show", () => {
    expect(
      shouldShowComposerContextStrip({
        isDraftHeroState: true,
        persistInActiveThreads: false,
        hasActiveProject: true,
        showGitControls: false,
        showEnvironmentIndicator: false,
        hostsRestingComposerControls: false,
      }),
    ).toBe(false);
  });

  it("keeps the strip for visible resting composer controls in a non-Git thread", () => {
    expect(
      shouldShowComposerContextStrip({
        isDraftHeroState: true,
        persistInActiveThreads: false,
        hasActiveProject: true,
        showGitControls: false,
        showEnvironmentIndicator: false,
        hostsRestingComposerControls: true,
      }),
    ).toBe(true);
  });

  it("shows Git controls without requiring an environment indicator", () => {
    expect(
      shouldShowComposerContextStrip({
        isDraftHeroState: true,
        persistInActiveThreads: false,
        hasActiveProject: true,
        showGitControls: true,
        showEnvironmentIndicator: false,
        hostsRestingComposerControls: false,
      }),
    ).toBe(true);
  });
});

describe("resolveEffectiveEnvMode", () => {
  it("keeps a server thread in worktree mode while its worktree is still being created", () => {
    expect(
      resolveEffectiveEnvMode({
        activeWorktreePath: null,
        hasServerThread: true,
        draftThreadEnvMode: undefined,
        preparingWorktree: true,
      }),
    ).toBe("worktree");
    expect(
      resolveEffectiveEnvMode({
        activeWorktreePath: null,
        hasServerThread: true,
        draftThreadEnvMode: undefined,
      }),
    ).toBe("local");
  });
});

describe("deriveLocalBranchNameFromRemoteRef", () => {
  it("supports remote names that contain slashes", () => {
    expect(deriveLocalBranchNameFromRemoteRef("my-org/upstream/feature/demo")).toBe(
      "upstream/feature/demo",
    );
  });
});

describe("dedupeRemoteBranchesWithLocalMatches", () => {
  it("hides remote refs when the matching local ref exists", () => {
    const input: VcsRef[] = [
      {
        name: "feature/demo",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "origin/feature/demo",
        isRemote: true,
        remoteName: "origin",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "origin/feature/remote-only",
        isRemote: true,
        remoteName: "origin",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
    ];

    expect(dedupeRemoteBranchesWithLocalMatches(input).map((ref) => ref.name)).toEqual([
      "feature/demo",
      "origin/feature/remote-only",
    ]);
  });

  it("keeps non-origin remote refs visible when git tracks with first-slash local naming", () => {
    const input: VcsRef[] = [
      {
        name: "upstream/feature",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "my-org/upstream/feature",
        isRemote: true,
        remoteName: "my-org/upstream",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
    ];

    expect(dedupeRemoteBranchesWithLocalMatches(input).map((ref) => ref.name)).toEqual([
      "upstream/feature",
      "my-org/upstream/feature",
    ]);
  });
});

describe("resolveBranchSelectionTarget", () => {
  it("reuses an existing secondary worktree for the selected ref", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.t3/worktrees/feature-a",
        refName: {
          isDefault: false,
          worktreePath: "/repo/.t3/worktrees/feature-b",
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo/.t3/worktrees/feature-b",
      nextWorktreePath: "/repo/.t3/worktrees/feature-b",
      reuseExistingWorktree: true,
    });
  });

  it("switches back to the main repo when the ref already lives there", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.t3/worktrees/feature-a",
        refName: {
          isDefault: true,
          worktreePath: "/repo",
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo",
      nextWorktreePath: null,
      reuseExistingWorktree: true,
    });
  });

  it("keeps checkout in the current worktree for non-default refs", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.t3/worktrees/feature-a",
        refName: {
          isDefault: false,
          worktreePath: null,
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo/.t3/worktrees/feature-a",
      nextWorktreePath: "/repo/.t3/worktrees/feature-a",
      reuseExistingWorktree: false,
    });
  });
});

describe("shouldIncludeBranchPickerItem", () => {
  it("keeps the synthetic checkout PR item visible for gh pr checkout input", () => {
    expect(
      shouldIncludeBranchPickerItem({
        itemValue: "__checkout_pull_request__:1359",
        normalizedQuery: "gh pr checkout 1359",
        createBranchItemValue: "__create_new_branch__:gh pr checkout 1359",
        checkoutPullRequestItemValue: "__checkout_pull_request__:1359",
      }),
    ).toBe(true);
  });

  it("surfaces an existing ref matching the sanitized query", () => {
    expect(
      shouldIncludeBranchPickerItem({
        itemValue: "new-branch",
        normalizedQuery: "new branch",
        createBranchItemValue: null,
        checkoutPullRequestItemValue: null,
      }),
    ).toBe(true);
  });
});

describe("sanitizeNewRefName", () => {
  it("collapses a run of whitespace into a single dash", () => {
    expect(sanitizeNewRefName("new   branch")).toBe("new-branch");
  });

  it("replaces tabs, which git rejects just like spaces", () => {
    expect(sanitizeNewRefName("new\tbranch")).toBe("new-branch");
  });

  it("preserves whitespace that git accepts", () => {
    expect(sanitizeNewRefName("new\u00a0branch")).toBe("new\u00a0branch");
    expect(sanitizeNewRefName("new\u2009branch")).toBe("new\u2009branch");
  });

  it("does not collapse dashes the user typed", () => {
    expect(sanitizeNewRefName("new - branch")).toBe("new---branch");
    expect(sanitizeNewRefName("foo--bar")).toBe("foo--bar");
  });
});
