---
name: add-ms365
description: Add Microsoft 365 integration so the container agent can read/send Outlook emails and manage calendar events via Microsoft Graph API.
---

# Add Microsoft 365 Integration

This skill adds the `@softeria/ms-365-mcp-server` MCP server to the container agent.
The agent gains tools to read and send emails, manage calendar events, and more — all via Microsoft Graph API with delegated permissions.

Tools added (subset used by default — `mail` + `calendar` preset):
- `mcp__ms365__list-mail-messages` — list inbox messages
- `mcp__ms365__get-mail-message` — read a specific email
- `mcp__ms365__send-mail` — send email
- `mcp__ms365__create-draft-email` — create a draft
- `mcp__ms365__list-calendars` — list calendars
- `mcp__ms365__list-calendar-events` — list events
- `mcp__ms365__create-calendar-event` — create event
- `mcp__ms365__update-calendar-event` — update event
- `mcp__ms365__delete-calendar-event` — delete event

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `ms365` is in `applied_skills`, skip to Phase 3 (Configure).

### Check prerequisites

You will need:
1. An **Azure AD App Registration** (Microsoft Entra ID)
2. Credentials: `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`

**Azure Portal setup guide** (tell the user):

> 1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
> 2. Name: anything (e.g. "NanoClaw MS365")
> 3. Supported account types: **Accounts in this organizational directory only** (or "personal Microsoft accounts" for personal use)
> 4. Redirect URI: leave empty → **Register**
> 5. Note the **Application (client) ID** → this is your `CLIENT_ID`
> 6. Note the **Directory (tenant) ID** → this is your `TENANT_ID`
> 7. Go to **Certificates & secrets** → **New client secret** → set expiry → **Add**
> 8. Copy the **Value** immediately → this is your `CLIENT_SECRET`
> 9. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**
> 10. Add these permissions:
>     - `Mail.ReadWrite`
>     - `Mail.Send`
>     - `Calendars.ReadWrite`
>     - `offline_access`
> 11. Click **Grant admin consent** (if you are the tenant admin) — or ask your IT admin

Ask the user to provide:
- `MS365_CLIENT_ID`
- `MS365_CLIENT_SECRET`
- `MS365_TENANT_ID` (use `consumers` for personal Microsoft accounts, otherwise the tenant UUID)

## Phase 2: Apply Code Changes

Run the skills engine to apply this skill's code package.

### Initialize skills system (if needed)

If `.nanoclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-ms365
```

This deterministically:
- Adds `@softeria/ms-365-mcp-server` global npm install to `container/Dockerfile`
- Three-way merges ms365 MCP config into `container/agent-runner/src/index.ts` (allowedTools + mcpServers)
- Three-way merges MS365 env vars into `src/container-runner.ts` (readSecrets)
- Records the application in `.nanoclaw/state.yaml`

If the apply reports merge conflicts, read the intent files:
- `modify/container/Dockerfile.intent.md`
- `modify/container/agent-runner/src/index.ts.intent.md`
- `modify/src/container-runner.ts.intent.md`

### Copy to per-group agent-runner

Existing groups have a cached copy of the agent-runner source. Copy the updated file:

```bash
for dir in data/sessions/*/agent-runner-src; do
  cp container/agent-runner/src/index.ts "$dir/"
done
```

### Validate and rebuild

```bash
npm run build
./container/build.sh
```

Build must be clean before proceeding.

## Phase 3: Configure

### Add credentials to .env

Add these lines to `.env`:

```bash
MS365_CLIENT_ID=your-client-id-here
MS365_CLIENT_SECRET=your-client-secret-here
MS365_TENANT_ID=your-tenant-id-or-consumers
```

### First-time authentication

The first time the agent uses an MS365 tool, it will initiate a **device code flow**:

1. The agent will output a URL and a device code
2. Open the URL (e.g. `https://microsoft.com/devicelogin`) in any browser
3. Enter the device code and sign in with your Microsoft account
4. The token is cached in the container session — you only need to do this once

> **Note:** Token is cached per container session. After a container restart (e.g. after idle timeout), you may need to re-authenticate once.

### Restart the service

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Phase 4: Verify

### Test via chat

Tell the user:

> Send a message like: "check my outlook emails" or "what's on my calendar today?"
>
> The first time, the agent will ask you to visit a URL and enter a code (device code flow).
> After signing in, it will list your emails or calendar events.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log | grep -i ms365
```

Look for:
- `[ms365]` — MCP server activity
- `mcp__ms365__list-mail-messages` — tool invocation

## Troubleshooting

### "AADSTS" authentication errors

- Double-check `MS365_CLIENT_ID`, `MS365_CLIENT_SECRET`, `MS365_TENANT_ID` in `.env`
- Ensure admin consent was granted for the API permissions
- For personal accounts: use `MS365_TENANT_ID=consumers`

### Agent doesn't use MS365 tools

The agent may not know MS365 is available. Try being explicit:
> "Use the mcp__ms365__list-mail-messages tool to show my last 5 emails"

Or just ask naturally — "check my email" or "show today's calendar".

### Token expired after container restart

Just ask the agent to check emails again — it will re-initiate the device code flow automatically.

### MCP server not found in container

The Dockerfile wasn't rebuilt. Run:
```bash
./container/build.sh
```
