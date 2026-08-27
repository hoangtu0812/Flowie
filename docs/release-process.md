# Release process

`main` deploys directly to CT107 production. It is the only deployed
environment, so each mainline change must be production-ready.

## Required change record

Every commit changes `CHANGELOG.md` in the same commit. Add concise entries
under `Unreleased` using the category that describes the outcome: `Added`,
`Changed`, `Fixed`, `Removed`, or `Security`. Record user-visible behavior,
operational impact, migration requirements, and configuration requirements;
avoid a chronological account of implementation steps.

## Deployment contract

The GitHub Actions production workflow builds the `migrate`, `api`, `web`, and
`worker` images. The one-shot `migrate` Compose service runs committed Prisma
migrations after PostgreSQL is healthy. `api` and `worker` depend on its
successful completion. A failed migration leaves the existing application
containers in place and blocks the new deployment.

## Versioned release

1. Select the next semantic version: increment patch for compatible fixes,
   minor for backward-compatible features, and major for incompatible changes.
2. In the release commit, promote all `Unreleased` entries to
   `## [x.y.z] — YYYY-MM-DD HH:MM +07`, using the intended production deploy
   time in Vietnam time, then recreate an empty `Unreleased` heading.
3. Push the release commit to `main` and wait for the deployment workflow,
   migration service, and API readiness check to succeed.
4. Tag the verified commit as `vX.Y.Z` and publish a GitHub release using the
   matching changelog section as its release notes.

Do not tag, announce, or mark a release successful before the production
workflow has verified the deployed revision.
