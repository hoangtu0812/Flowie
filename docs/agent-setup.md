# Agent provider setup

Agent uses one active AI provider per workspace. Workspace owners and
administrators configure it from **Settings → Agent personalization**; members
can use the configured provider to draft plans.

## Production key encryption

The API service needs a stable Fernet key before any provider key can be saved.
Generate it once on CT107 and put the result in `/opt/flowie/.env.production`:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

```dotenv
AGENT_SECRETS_ENCRYPTION_KEY=generated-value
```

Do not commit this value or rotate it without first re-encrypting every saved
workspace provider key. A changed key cannot decrypt keys written with the old
one.

## Supported providers

| Provider      | Official API URL                                   | Default model      |
| ------------- | -------------------------------------------------- | ------------------ |
| OpenAI        | `https://api.openai.com/v1`                        | `gpt-4.1-mini`     |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash` |

The server accepts only the matching official HTTPS host for each provider, so
a workspace key cannot be redirected to an arbitrary URL. The provider key is
encrypted in PostgreSQL and is never included in an API response.

## Planning workflow

1. A user submits a request and can attach up to five Markdown, DOCX, or XLSX
   files (10 MB each).
2. Agent sends the request, conversation context, and temporary extracted file
   text to the active provider through a LangGraph planning step.
3. Agent returns a structured proposal: projects, project dates, issues,
   priorities, project links, and questions for any missing facts.
4. The user can reply to refine the plan. A proposal that needs clarification
   cannot be accepted.
5. **Accept plan** creates the approved projects and issues through Flowie's
   existing APIs and saves an audit record. No task, project, or issue is
   created during drafting.

## Live progress

The chat uses the `POST /api/v1/agent/conversations/messages/stream` endpoint
for Server-Sent Events. The API reports only concrete workflow steps: source
reading, workspace or insight queries, provider calls, proposal validation, and
conversation persistence. The browser replaces each running step with its
completed state and stacks multiple steps under the current activity.

The indicators use a vendored, reviewed snapshot of the MIT-licensed
`thinking-orbs` package in `packages/thinking-orbs`. The source snapshot keeps
the production build independent of public package-registry availability.

## Read-only insights

Agent also supports explicit read-only workspace insights. These bypass the AI
provider and return data directly from Flowie, so they never show **Accept
plan** or create records. Workspace owners and administrators manage the
installed set from **Settings → Agent personalization → Workspace tools**.
The initial registry provides `issues.count`, `issues.overdue`,
`issues.by_status`, `issues.by_assignee`, `projects.progress`, and
`cycles.progress`. Each query is scoped to teams the requester can access;
removed tools are not callable and Agent reports that the workspace must
install the relevant tool.

New insights must be added as an explicit entry in `READ_ONLY_CAPABILITIES` in
`apps/api-python/app/domains/agent.py`, with a narrow request matcher and a
permission-scoped query. Insight replies are deliberately excluded from future
planning context, preventing a report request from changing a later draft.

## Personal skills

Skills follow a user across workspaces. Users install and remove their own
skills from **Settings → Agent personalization → Personal skills**. The initial
`issue.defaults` skill lets a user set a default priority and optional number
of days until due. Agent applies these values to a draft only if that request
does not explicitly provide a conflicting priority or due date. Workspace tool
settings never expose or change another user's skill configuration.
