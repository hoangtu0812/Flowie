# Release process

Nothing in this repository deploys anything. `main` is the trunk every release
is cut from, and each server that runs Flowie — including the one people use —
is deployed by hand from its own checkout. A merge, a tag and a published
release all leave every running system exactly as it was.

That makes each mainline change production-bound in the only sense that
matters: the next person to pull will get it, with no staging environment in
between to catch what the pull request missed.

## Required change record

Every commit changes `CHANGELOG.md` in the same commit. Add concise entries
under `Unreleased` using the category that describes the outcome: `Added`,
`Changed`, `Fixed`, `Removed`, or `Security`. Record user-visible behavior,
operational impact, migration requirements, and configuration requirements;
avoid a chronological account of implementation steps.

Write each entry in English, followed by an indented `VI:` line with the
Vietnamese translation. Once the pull request exists, end the English text with
its number, for example `(#19)`.

## What the checks cover

`.github/workflows/verify-mcp.yml` runs on every pull request that touches the
application, and `.github/workflows/desktop.yml` runs on every pull request
that touches `apps/desktop`. Between them they are the only gate.

Nothing runs on a push to `main`. A commit pushed straight to the trunk has
therefore passed nothing, and a release commit is exactly that: it is also the
one commit that changes the version and the release notes baked into the web
image, so it cannot be waved through on the strength of the pull requests
behind it. Run `verify-mcp.yml` on it with `workflow_dispatch` and require a
green result.

When judging any run, check that it exists for the exact head commit rather
than that the branch has a green run somewhere. GitHub does occasionally fail
to create a run for a push.

## Deployment contract

Deployment is manual, with Compose, on each server:

```sh
git pull
docker compose --profile app up -d --build --force-recreate migrate api web
```

The one-shot `migrate` service runs committed Prisma migrations once PostgreSQL
is healthy, and `api` and `worker` depend on its successful completion, so a
failed migration leaves the existing containers in place and blocks the new
deployment.

Rebuild every service a release actually touched, which the changelog entries
state. Rebuilding `web` alone is the common mistake: a change under
`apps/api-python` leaves the new bundle talking to an old API. A release that
adds a migration must rebuild `migrate` as well and run it before `api`, then
compare the migration count in the `migrate` logs with
`ls packages/database/prisma/migrations/*/migration.sql | wc -l`.

`apps/desktop` is in no server image and ships from its own workflow, so a
release containing only desktop changes needs no server rebuild at all.

## Versioned release

1. Select the next semantic version: increment patch for compatible fixes,
   minor for backward-compatible features, and major for incompatible changes.
2. In the release commit, promote all `Unreleased` entries to
   `## [x.y.z] — YYYY-MM-DD HH:MM +07`, append each entry's merge commit short
   hash next to its pull request number, for example `(#19, 431edd6)`, then
   recreate an empty `Unreleased` heading. Resolve each hash with
   `gh pr view <n> --json mergeCommit`: a squash-merged pull request leaves no
   `Merge pull request #n` subject in the history, so scanning `git log`
   silently misses it.
3. Push the release commit to `main`, run `verify-mcp.yml` on that exact
   commit, and wait for it to pass.
4. Tag the checked commit as `vX.Y.Z` and publish a GitHub release using the
   matching changelog section as its release notes. GitHub caps a release body
   at 125,000 characters; a section longer than that goes out as English only
   with a pointer to `CHANGELOG.md`.
5. Ask the maintainer to pull and rebuild on each server, naming the services.

Do not tag or announce a release before its checks have passed, and do not
describe it as live before a maintainer confirms they have deployed it.
