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
