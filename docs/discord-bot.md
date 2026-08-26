# Discord bot notifications

Flowie supports two Discord delivery modes:

1. **Workspace webhook** — an owner or admin configures it in Flowie settings.
   It receives events for that workspace only.
2. **Flowie bot broadcaster** — optional server-wide delivery through a Discord
   bot account. It posts the same supported events to one configured channel.

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

Interactive slash commands are intentionally not enabled yet: they require a
public Discord interactions endpoint and request-signature verification. The
bot broadcaster above is fully operational for notifications without exposing
any inbound command surface.
