---
name: add-icloud-caldav
description: Add iCloud Calendar integration via CalDAV (tsdav). Lets container agents read all iCloud calendars. Requires an Apple ID app-specific password.
---

# Add iCloud Calendar (CalDAV)

This skill adds iCloud Calendar access to container agents using the CalDAV protocol via the `tsdav` npm library. The agent gains a `icloud-cal` CLI tool to list, query, and inspect iCloud calendar events.

Unlike Microsoft 365 (which uses Graph API + OAuth), iCloud CalDAV uses HTTP Basic auth with an **app-specific password** — no Apple Developer account needed.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `add-icloud-caldav` is in `applied_skills`, skip to Phase 3 (Configure).

### Prerequisites

You need:
1. An **Apple ID** with 2-factor authentication enabled (required for app-specific passwords)
2. An **app-specific password** generated at [account.apple.com](https://account.apple.com)

No Apple Developer account, no OAuth app registration, no Azure portal — just your Apple ID.

## Phase 2: Apply Code Changes

### Initialize skills system (if needed)

If `.nanoclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-icloud-caldav
```

This deterministically:
- Installs `tsdav` and `ical.js` npm packages into `container/Dockerfile`
- Adds `container/skills/icloud-caldav/icloud-cal` (CLI script)
- Adds `container/skills/icloud-caldav/SKILL.md` (agent-facing docs)
- Three-way merges iCloud env vars into `src/container-runner.ts` (readSecrets)
- Records the application in `.nanoclaw/state.yaml`

If the apply reports merge conflicts, read the intent files in `modify/`.

### Manual alternative (if skills engine not available)

If the skills engine isn't set up, apply changes manually:

**1. Install packages in Dockerfile**

Add to `container/Dockerfile` (in the `npm install -g` section or a new RUN layer):

```dockerfile
RUN npm install -g tsdav ical.js node-fetch
```

**2. Copy the CLI script**

Copy `add/container/skills/icloud-caldav/icloud-cal` to `container/skills/icloud-caldav/icloud-cal` and make it executable:

```bash
cp add/container/skills/icloud-caldav/icloud-cal container/skills/icloud-caldav/icloud-cal
chmod +x container/skills/icloud-caldav/icloud-cal
```

**3. Add env vars to container-runner.ts**

In `src/container-runner.ts`, in the `readSecrets` (or equivalent env-passing) section, add:

```typescript
'APPLE_ID',
'APPLE_APP_PASS',
```

### Validate and rebuild

```bash
npm run build
./container/build.sh
```

Build must be clean before proceeding.

## Phase 3: Configure

### Step 1 — Generate an app-specific password

Tell the user:

> 1. Go to [account.apple.com](https://account.apple.com) and sign in
> 2. Navigate to **Sign-In and Security** → **App-Specific Passwords**
> 3. Click **+** (Generate Password)
> 4. Label: `nanoclaw` (or anything)
> 5. Copy the generated password — format: `xxxx-xxxx-xxxx-xxxx`
>
> ⚠️ You cannot view this password again after closing the dialog. Save it now.

### Step 2 — Add credentials to .env

```bash
APPLE_ID=your@apple.id.email
APPLE_APP_PASS=xxxx-xxxx-xxxx-xxxx
```

### Step 3 — Sync env to container and restart

```bash
mkdir -p data/env && cp .env data/env/env
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Phase 4: Verify

### Test via CLI (inside container)

```bash
icloud-cal list-calendars
```

Expected output: JSON array of your iCloud calendars with `displayName`, `url`, and `ctag`.

```bash
icloud-cal events --days 7
```

Expected: JSON array of events in the next 7 days.

### Test via chat

Ask the agent:
> "Jaké mám dnes schůzky v iCloud kalendáři?"

The agent should use the `icloud-cal` tool and return a list of events.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log | grep -i icloud
```

## CLI Reference (`icloud-cal`)

The `icloud-cal` script is available inside the container. It reads `APPLE_ID` and `APPLE_APP_PASS` from environment.

```
icloud-cal list-calendars
  → Lists all calendars with displayName, url, color

icloud-cal events [--days N] [--calendar NAME]
  → Lists events. Defaults to next 7 days. Optionally filter by calendar name.
  → Output: JSON array of {title, start, end, calendar, location, notes}

icloud-cal today
  → Shorthand: events for today only

icloud-cal tomorrow
  → Shorthand: events for tomorrow only

icloud-cal week
  → Shorthand: events for next 7 days
```

All commands output JSON to stdout. Errors go to stderr with exit code 1.

## Agent-Facing Documentation

The file `container/skills/icloud-caldav/SKILL.md` (added by this skill) documents the tool for the container agent. It includes examples and explains how to interpret recurring events.

## Troubleshooting

### `Authentication failed` / 401 error

- Verify `APPLE_ID` is the actual Apple ID email (not a nickname/alias)
- Verify `APPLE_APP_PASS` is in the `xxxx-xxxx-xxxx-xxxx` format
- App-specific passwords can be revoked at account.apple.com — generate a new one if needed
- Ensure 2FA is enabled on the Apple account (required for app-specific passwords)

### `Cannot discover calendar home set`

iCloud uses cluster-specific URLs. `tsdav` discovers the correct cluster via PROPFIND. If discovery fails:
- Check network connectivity from the container to `caldav.icloud.com`
- Try: `curl -v -u "your@email.com:xxxx-xxxx-xxxx-xxxx" https://caldav.icloud.com/ -X PROPFIND -H "Depth: 0"`

### No events returned but calendars listed

- Check `--days` parameter — default is 7 days forward
- iCloud may have a delay syncing events from devices
- Recurring events: the script expands RRULE instances — if an event is missing, check if it's a recurring event that started before the query range

### Credentials expired / revoked

App-specific passwords don't expire by themselves, but they can be revoked:
1. Go to account.apple.com → App-Specific Passwords → Revoke all (or find nanoclaw specifically)
2. Generate a new password
3. Update `.env` and sync: `cp .env data/env/env`
4. Restart the service

### Events from iCloud not showing in daily summary

Make sure the daily summary agent prompt references `icloud-cal` — it doesn't use it automatically. Add to the scheduled task prompt:

```
Schůzky zjisti z obou zdrojů:
- MS365 kalendář: mcp__ms365__get-calendar-view
- iCloud kalendář: bash tool → `icloud-cal today`
Výsledky slouč a deduplikuj.
```

## Architecture Notes

**Why CLI, not MCP server?**

The `tsdav` library is used synchronously in a Node.js script rather than wrapping it in a full MCP server. This is simpler to install and maintain — the agent invokes it via `bash` tool, receives JSON output, and parses it. Adding a full MCP server (with stdio transport, tool definitions, etc.) would be warranted only if write access (creating/updating events) is needed frequently.

**CalDAV discovery flow (what happens under the hood):**

1. PROPFIND `https://caldav.icloud.com/` → returns `current-user-principal` (e.g. `/347723822/principal/`)
2. PROPFIND on principal → returns `calendar-home-set` on a cluster (e.g. `p22-caldav.icloud.com`)
3. PROPFIND on calendar home → returns list of calendars
4. REPORT on each calendar with time range → returns matching events (ICS format)
5. ICS parsed with `ical.js` → serialized to JSON

`tsdav` handles steps 1–4 automatically. Step 5 is handled in the CLI script.

**Polling vs. webhooks:**

iCloud CalDAV does not support push notifications or webhooks. The agent must poll. For the daily summary use case (once per day at 7:00), this is fine. If real-time calendar awareness is needed, set up a more frequent scheduled task (e.g. every 15 minutes) that checks for upcoming events in the next 30 minutes.
