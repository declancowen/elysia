const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveElysiaReleaseVersion, resolveElysiaRelease } = require("./check-elysia-release.cjs");

test("accepts the first Elysia stable release without inheriting upstream versions", () => {
  assert.equal(resolveElysiaReleaseVersion("v0.0.1", []), "0.0.1");
  assert.equal(resolveElysiaReleaseVersion("0.0.1", []), "0.0.1");
});

test("requires a newer stable version so installed apps receive an update", () => {
  const releases = [{ tag_name: "v0.0.44" }, { tag_name: "v0.1.0", draft: true }];
  assert.equal(resolveElysiaReleaseVersion("v0.0.45", releases), "0.0.45");
  assert.equal(resolveElysiaReleaseVersion("0.0.100", releases), "0.0.100");
  assert.equal(resolveElysiaReleaseVersion("1.0.0", releases), "1.0.0");
  for (const version of ["0.0.44", "0.0.43", "0.0.45-nightly.1", "01.0.0", "1.2.3+build"]) {
    assert.throws(() => resolveElysiaReleaseVersion(version, releases));
  }
});

test("compares every published stable release and ignores prereleases", () => {
  assert.throws(() => resolveElysiaReleaseVersion("0.9.9", [{ tag_name: "v1.0.0" }]));
  assert.throws(() =>
    resolveElysiaReleaseVersion("1.1.0", [{ tag_name: "v1.2.0" }, { tag_name: "v1.0.0" }]),
  );
  assert.equal(
    resolveElysiaReleaseVersion("0.0.45", [{ tag_name: "v1.0.0-preview.1", prerelease: true }]),
    "0.0.45",
  );
});

test("rejects a conflicting tag and accepts an untagged main commit", async () => {
  const context = {
    eventName: "workflow_dispatch",
    ref: "refs/heads/main",
    sha: "candidate",
    repo: { owner: "declancowen", repo: "elysia" },
    payload: { repository: { default_branch: "main" } },
  };
  const github = {
    paginate: async () => [],
    rest: {
      repos: {
        listReleases() {},
        compareCommitsWithBasehead: async () => ({ data: { status: "identical" } }),
        getCommit: async () => ({ data: { sha: "older-commit" } }),
      },
    },
  };
  await assert.rejects(
    resolveElysiaRelease({ github, context, raw: "0.0.45" }),
    /not release commit/,
  );
  github.rest.repos.getCommit = async () => {
    throw Object.assign(new Error("Not found"), { status: 404 });
  };
  assert.deepEqual(await resolveElysiaRelease({ github, context, raw: "0.0.45" }), {
    version: "0.0.45",
    tag: "v0.0.45",
  });
  github.rest.repos.getCommit = async () => ({ data: { sha: "candidate" } });
  assert.deepEqual(
    await resolveElysiaRelease({
      github,
      context: { ...context, eventName: "push", ref: "refs/tags/v0.0.45" },
      raw: "v0.0.45",
    }),
    { version: "0.0.45", tag: "v0.0.45" },
  );
  await assert.rejects(
    resolveElysiaRelease({
      github,
      context: { ...context, ref: "refs/heads/feature" },
      raw: "0.0.45",
    }),
    /must be dispatched from main/,
  );
});
