# Repository Operating Rules

## Deployment model

- This repository has one deployed environment: **CT107 production**.
- A push to `main` triggers `.github/workflows/deploy-production.yml`; there is
  no staging, preview, or development deployment target.
- Treat every change that reaches `main` as production-bound. Do not depend on
  a later environment to discover schema, configuration, or deployment errors.
- Prisma is the database schema owner. The Compose `migrate` service must
  complete successfully before `api` or `worker` starts. Never bypass this
  dependency or apply an uncommitted schema change directly to production.

## Change records

- Every commit must update `CHANGELOG.md`, including application, schema,
  infrastructure, CI, configuration, documentation, and operational changes.
- Add the entry under `Unreleased` using `Added`, `Changed`, `Fixed`,
  `Removed`, or `Security`. Describe the externally observable result and any
  deployment constraint; do not write an implementation diary.
- Keep each change record in the same commit as the code or configuration it
  documents. A commit without its changelog entry is incomplete.

## Versioned releases

1. Prepare a release commit on `main`: promote `Unreleased` entries to
   `## [x.y.z] — YYYY-MM-DD HH:MM +07`, increment the semantic version, and
   leave a new empty `Unreleased` section.
2. Let the production workflow deploy that exact commit. Verify its workflow,
   API readiness, and migration result before declaring the release complete.
3. Create annotated tag `vX.Y.Z` on the verified commit and publish a GitHub
   release whose notes are the matching `CHANGELOG.md` section. Never tag a
   revision that has not deployed successfully.

## Source comments

- Write source-code comments in English only.
- Comments must document technical intent, invariants, security constraints,
  compatibility behavior, or non-obvious operational decisions.
- Do not use conversational comments, status updates, personal attribution, or
  prose addressed to a reader. Delete comments that only restate the code.
