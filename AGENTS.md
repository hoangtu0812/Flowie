# Repository Operating Rules

## Deployment model

- This repository has one deployed environment: **CT107 production**.
- A push to `main` triggers `.github/workflows/deploy-production.yml`; there is
  no staging, preview, or development deployment target.
- A push that changes only Markdown files, `docs/`, `llms.txt`, or Unreleased
  changelog entries skips verification and deployment
  (`scripts/deploy-scope.sh`). A release heading in `CHANGELOG.md`, any other
  file, or a manual workflow run deploys.
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
- Write each entry in English and Vietnamese: the English bullet first, then an
  indented line starting with `VI:` that carries the same meaning. Keep the
  English sentence first; the Help menu's "What's new" shows its opening words.
- Reference the change: end the English text with the pull request, for
  example `(#19)`, by adding it on the pull request branch once the number
  exists. The release commit appends the merge commit's short hash to each
  entry it promotes, for example `(#19, 431edd6)`.

   ```md
   - Integrations show MCP connections first with icon actions. (#18, 431edd6)
     VI: Trang Integrations hiển thị kết nối MCP trước, thao tác bằng icon.
   ```

- Keep each change record in the same commit as the code or configuration it
  documents. A commit without its changelog entry is incomplete.

## Versioned releases

1. Prepare a release commit on `main`: promote `Unreleased` entries to
   `## [x.y.z] — YYYY-MM-DD HH:MM +07`, increment the semantic version, append
   each entry's merge commit short hash next to its pull request number, and
   leave a new empty `Unreleased` section.
2. Let the production workflow deploy that exact commit. Verify its workflow,
   API readiness, and migration result before declaring the release complete.
3. Create annotated tag `vX.Y.Z` on the verified commit and publish a GitHub
   release whose notes are the matching `CHANGELOG.md` section. Never tag a
   revision that has not deployed successfully.

## Feature documents (FDS/TDS)

- A task that changes behaviour or design keeps its feature's FDS (behaviour,
  rules, acceptance criteria) and TDS (design, data, API, tests) current in the
  project's Docs tree, under `<project> / <module> / <feature>`.
- Before coding a Flowie task, call the Flowie MCP tool `get_feature_docs` with
  the issue. Update or create the documents with `upsert_feature_doc`: send the
  full updated Markdown, keep existing sections, and give a one-sentence
  `changeSummary`. The tool adds the change-log row and links the document to
  the issue.
- The order for a task is: comment the plan → set the end date → move to In
  Progress → FDS/TDS → code → pull request.
- Skip the documents only when the change alters no documented behaviour or
  design (for example a pure refactor or a dependency bump), and say so in the
  plan comment. A missing FDS/TDS is a warning for now, not a blocker.

## Source comments

- Write every new or edited source-code comment in English and Vietnamese:
  the English text first, then the Vietnamese translation in the same comment
  block, starting with `VI:`. Both parts carry the same meaning.

   ```ts
   // Rejects webhook hosts outside Teams Workflows to prevent SSRF.
   // VI: Từ chối host webhook ngoài Teams Workflows để chống SSRF.
   ```

- Explain in detail what the code handles and why: inputs and outputs it
  expects, edge cases, invariants, security constraints, compatibility
  behavior, and non-obvious operational decisions.
- Change history (what changed, commit, pull request) belongs in
  `CHANGELOG.md`, not in source comments: a commit cannot contain its own hash,
  and history in comments goes stale with every edit.
- Existing English-only comments stay valid; add the Vietnamese part when you
  edit one. Generated, vendored, and third-party code is exempt.
- Do not use conversational comments, status updates, personal attribution, or
  prose addressed to a reader. Delete comments that only restate the code.
