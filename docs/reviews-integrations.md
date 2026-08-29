# Reviews integrations runbook

Flowie can connect GitHub and Azure DevOps to the same workspace. Each imported
repository must be enabled and mapped to one Flowie team before its reviews are
visible. The initial integration is intentionally read-only: comments,
approvals, merges, and full diffs remain on the source provider.

## CT107 configuration

Set these values in the production environment before deploying:

```dotenv
SCM_SECRETS_ENCRYPTION_KEY=<dedicated Fernet key>
SCM_GITHUB_APP_ID=<GitHub App ID>
SCM_GITHUB_APP_PRIVATE_KEY=<PEM with newlines encoded as \n>
SCM_GITHUB_WEBHOOK_SECRET=<random GitHub App webhook secret>
```

Keep the Fernet key stable across releases: changing or losing it makes saved
provider credentials unreadable. Never commit any of these values.

## GitHub App

Grant only metadata read, contents read, and pull requests read permissions.
Subscribe to `pull_request`, `pull_request_review`, and
`pull_request_review_thread`, then set the App webhook URL to:

```text
https://<public-api-host>/api/v1/scm/webhooks/github
```

Use the same random value for the GitHub App webhook secret and
`SCM_GITHUB_WEBHOOK_SECRET`. Flowie validates the signature and delivery ID,
then resolves the workspace connection from the installation ID.

## Azure DevOps

Use a Microsoft Entra workload identity (service principal or managed
identity), not a personal access token or legacy Azure DevOps OAuth app. Add
that identity to the Azure DevOps organization with only the repository read
access needed by the selected projects.

Create Azure DevOps service hooks for `git.pullrequest.created`,
`git.pullrequest.updated`, and `git.pullrequest.merged`. Copy the webhook URL
shown in Flowie settings. Configure Basic authentication with username
`flowie` and the one-time password shown when the connection is created or
rotated.

## Access and identity boundaries

- Workspace owners and administrators can manage integrations.
- Other users see a review only when they are an active member of the Flowie
  team mapped to that repository.
- A review can link only to an Issue in that same team.
- Flowie users map to immutable provider user IDs. Display names and email
  addresses are not used as authorization identities.

## Synchronization and recovery

Manual synchronization imports the most recent 100 pull requests per enabled
repository with bounded concurrency. Webhooks keep current reviews fresh.
Deliveries use a durable PostgreSQL queue, a reclaimable five-minute lease,
eight attempts, and exponential backoff. Raw provider payloads are cleared
after successful processing or terminal failure.

If a connection fails, inspect its sanitized error in Settings, correct the
provider permission or credential, retry synchronization, and reactivate the
connection if needed. Repeated webhook deliveries are safe because provider
delivery IDs and review identities are idempotent.

## CT107 rollout checklist

Before the production push:

1. Back up PostgreSQL and configure the required environment values.
2. Register the GitHub App webhook and install it on a small repository set.
3. Add the Azure workload identity and create service hooks for a small project.
4. Build the production images and verify Compose still requires `migrate` to
   finish successfully before `api` and `worker` start.

After deployment:

1. Confirm the production workflow, migration result, and API readiness.
2. Connect and synchronize one repository from each provider.
3. Verify team isolation, assigned/created counts, unread revisions, and Issue
   linking before expanding repository access.
4. Tag and publish a release only after that exact commit is verified in CT107.
