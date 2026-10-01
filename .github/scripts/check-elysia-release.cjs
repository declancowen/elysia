const { assertReleaseSource } = require("./check-nightly-release.cjs");

const STABLE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function resolveElysiaReleaseVersion(raw, releases) {
  const version = raw.replace(/^v/, "");
  if (!STABLE_VERSION.test(version)) {
    throw new Error(`Elysia releases require a stable X.Y.Z version; received ${raw}.`);
  }
  const candidate = version.split(".").map(BigInt);
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const previousVersion = release.tag_name.replace(/^v/, "");
    if (!STABLE_VERSION.test(previousVersion)) continue;
    const previous = previousVersion.split(".").map(BigInt);
    const changedPart = candidate.findIndex((part, index) => part !== previous[index]);
    if (changedPart === -1 || candidate[changedPart] < previous[changedPart]) {
      throw new Error(
        `Version ${version} must be newer than published release ${release.tag_name}.`,
      );
    }
  }
  return version;
}

async function resolveElysiaRelease({ github, context, raw }) {
  await assertReleaseSource({ github, context, releaseChannel: "stable" });
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...context.repo,
    per_page: 100,
  });
  const version = resolveElysiaReleaseVersion(raw, releases);
  const tag = `v${version}`;
  try {
    const { data: commit } = await github.rest.repos.getCommit({ ...context.repo, ref: tag });
    if (commit.sha !== context.sha) {
      throw new Error(`Tag ${tag} points to ${commit.sha}, not release commit ${context.sha}.`);
    }
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  return { version, tag };
}

module.exports = { resolveElysiaReleaseVersion, resolveElysiaRelease };
