# Repository Operating Rules

## Flowie project for this repository

- This repository (`https://github.com/hoangtu0812/Flowie.git`, base branch
  `main`) is the code of Flowie project **Flowie** (identifier `FL`, id
  `czupvogljb6pm9sceunw3aaat`) in team **DTD** (id
  `cizp13d9d5jaejvhtknou0bbs`). Create Flowie tasks for work in this repository
  in that team and project.
- The same Flowie MCP connection also reaches other projects. Their code lives
  in other repositories, so do not implement their tasks here:

  | Project | Identifier | Repository |
  | --- | --- | --- |
  | Integrated Business Platform | `TAM` | `https://dev.azure.com/bsr-its/BSR-Digital-Operations-Platform` (`develop`) |
  | AI Platform | `AIP` | none configured |
  | Meeting | `BSR-MEETING` | none configured |

- Before working on a task, read its project (`get_issue_context`). If it is
  not `FL`, stop and say which project and repository it belongs to. This
  table can go out of date: `list_projects` and `get_project_repositories` give
  the current list (Settings → Integrations → External coding agent
  configuration).

## Deployment model

- The Flowie instance people use, which also serves the Flowie MCP endpoint,
  runs on a server the maintainer deploys by hand: `git pull` in the server's
  checkout, then rebuild and restart the Compose services. Merging to `main`
  does not put a change on that server; it is live only after the maintainer
  pulls and rebuilds.
- Nothing deploys automatically. `.github/workflows/verify-mcp.yml` runs only
  by hand (`workflow_dispatch`) for now, so pull requests are not checked
  automatically: run the targeted tests for what you changed before opening
  one, and dispatch the suite on a risky branch. It deploys nothing. Every
  environment is deployed by hand from its own checkout, so merging changes no
  running system. There is no staging, preview, or development target.
- Because `main` itself is unchecked, a commit pushed straight to it — a
  release commit is the usual case — has passed nothing. Run `verify-mcp.yml`
  on that commit with `workflow_dispatch` and require it green before relying
  on it.
- Treat every change that reaches `main` as production-bound. Do not depend on
  a later environment to discover schema, configuration, or deployment errors.
- Prisma is the database schema owner. The Compose `migrate` service must
  complete successfully before `api` or `worker` starts. Never bypass this
  dependency or apply an uncommitted schema change directly to production.
- `migrate` is built from its own image
  (`infrastructure/docker/prisma-migrate.Dockerfile`). A change that adds a
  migration must say, in its pull request and changelog entry, to rebuild
  `migrate`, `api` and `web` and run `migrate` before `api`; rebuilding only
  `web` and `api` leaves the new migration unapplied. After a deploy, compare
  the migration count in the `migrate` logs with
  `ls packages/database/prisma/migrations/*/migration.sql | wc -l`.
- A server-side change, such as a new MCP tool, is not visible to agents until
  the maintainer pulls, rebuilds and restarts the API, and the MCP client
  reconnects.

## Type checking

- `apps/api-python` is type checked with mypy (`apps/api-python/mypy.ini`,
  pinned `mypy==2.4.1` in CI). Run `mypy app` from `apps/api-python` before
  opening a pull request that touches Python.
- Every package except `app/domains` is checked including unannotated
  function bodies. Never weaken the level of a package that passes, and never
  add a blanket `# type: ignore`: fix the type, or ignore one error code on one
  line with a comment saying why.

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
2. Check that exact commit: run `verify-mcp.yml` on it with
   `workflow_dispatch` and require a green result. Nothing runs on a push to
   `main`, so without this the release commit — the one commit that changes
   the version and the release notes baked into the web image — is the only
   revision nobody checked.
3. Create annotated tag `vX.Y.Z` on the checked commit and publish a GitHub
   release whose notes are the matching `CHANGELOG.md` section. Never tag a
   revision whose checks have not passed.
4. Ask the maintainer to pull and rebuild on each server they run, and say
   which services need rebuilding. A release is tagged, not deployed: it
   reaches people only when they have done that, so never report it as live
   until they confirm.

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
