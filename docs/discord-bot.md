# Discord bot notifications

Flowie supports two Discord delivery modes:

1. **Workspace webhook** — an owner or admin configures it in Flowie settings.
   It receives events for that workspace only.
2. **Flowie bot broadcaster** — optional server-wide delivery through a Discord
   bot account. It posts the same supported events to one configured channel.

## Configure the workspace webhook

The webhook is the per-workspace mode and is configured entirely from the UI by
a workspace owner or admin; no server change or redeploy is involved.

1. In Discord, open the target channel, then **Edit Channel → Integrations →
   Webhooks → New Webhook**. Name it, pick the channel, then **Copy Webhook
   URL**.
2. In Flowie, open **Settings → Connected accounts → Discord → Connect**.
3. Paste the URL, leave **Enable Discord notifications** on, then **Save
   configuration**. Only `https://discord.com/api/webhooks/...` (or
   `discordapp.com`) is accepted.
4. Press **Send test**. A successful test posts a confirmation message in the
   channel; the button stays disabled until a configuration is saved.

The stored URL is never returned to the browser again — the endpoint reports it
masked — so replacing it means pasting a new URL over the old one. Turning the
switch off keeps the URL but stops delivery.

## Configure the bot broadcaster

1. In the [Discord Developer Portal](https://discord.com/developers/applications),
   create an application and add a Bot.
2. Invite the bot to the target server with permission to View Channel and Send
   Messages.
3. Enable Developer Mode in Discord, then copy the target channel ID.
4. On the server, add the following only to `/opt/flowie/.env.production`:

   ```dotenv
   DISCORD_BOT_TOKEN=your-secret-bot-token
   DISCORD_BOT_CHANNEL_ID=your-channel-id
   ```

5. Redeploy the API:

   ```bash
   docker compose --env-file .env.production --profile app up -d --build api
   ```

The token is read only by the Python API container and is never returned from
an API endpoint or exposed to the browser. Rotate it immediately in Discord if
it is pasted into a terminal recording, a Git commit, or chat.

## Current events

- issue created, assigned and status changed;
- issue comment created;
- project properties updated;
- project update/comment posted.

Plus `issue.updated` for the remaining issue properties (title, priority,
project, due date, estimate, description).

Each event is delivered as a Discord embed: who did it, the issue code and
title, a link straight to the item, the values that moved (`Todo → In
Progress`) and the comment or project update itself. The link needs `APP_URL`
(or `NEXT_PUBLIC_APP_URL`) to be set on the API container — without it the embed
is still delivered, only without a clickable title.

Discord delivery is not limited to the Inbox recipients: the Inbox skips the
person who caused the event, while Discord receives every supported event. A
single-member workspace therefore still sees its own activity in the channel —
which is also why an Inbox can be empty while the Discord channel is busy.

Interactive slash commands are intentionally not enabled yet: they require a
public Discord interactions endpoint and request-signature verification. The
bot broadcaster above is fully operational for notifications without exposing
any inbound command surface.
