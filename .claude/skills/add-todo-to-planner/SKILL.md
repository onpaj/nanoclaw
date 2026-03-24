---
name: add-todo-to-planner
description: Migrate personal tasks from Microsoft To Do to a Planner plan. Uses Graph API with existing MS365 credentials.
---

# Add To Do → Planner Migration

This skill adds a migration script that moves personal tasks from Microsoft To Do to a Planner "Personal" plan. The script runs inside the container and reuses the MS365 MCP server's authentication.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `add-todo-to-planner` is in `applied_skills`, skip to Phase 3.

### Prerequisites

- MS365 skill must be applied and authenticated (the MCP server must have a valid token cache)
- A Planner plan named "Personal" must exist (in any group the user belongs to)

## Phase 2: Apply Code Changes

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-todo-to-planner
```

This adds:
- `container/skills/todo-to-planner/migrate.mjs` — the migration script
- `container/skills/todo-to-planner/SKILL.md` — agent-facing documentation

No Dockerfile or container-runner changes needed — the script uses Node.js built-in `fetch` and reads the existing MS365 token cache.

### Rebuild container (not strictly required — skills are synced at runtime)

The skill files are automatically synced to containers via the container-runner's skill sync mechanism. A container rebuild is NOT required.

## Phase 3: Verify

### Test with dry run

Ask the agent to run:

```
node /home/node/.claude/skills/todo-to-planner/migrate.mjs --dry-run
```

This should list personal To Do tasks without making changes.

### Run migration

```
node /home/node/.claude/skills/todo-to-planner/migrate.mjs
```

## Troubleshooting

### "Token cache not found"

The MS365 MCP server hasn't authenticated yet. Trigger any MS365 MCP tool (e.g. list emails) to initialize the token cache.

### "Plan not found"

The script searches through the user's groups for a plan titled "Personal". If the plan uses a different name or is a roster-based personal plan, pass the plan ID directly:

```
node migrate.mjs --plan-id <plan-id>
```

Find the plan ID via the MS365 MCP server's Planner tools.

### Rate limiting

The script adds 200ms delay between task creations. For large numbers of tasks (>50), Graph API may still throttle. Re-run the script — already-migrated tasks won't be duplicated (they'll have Planner links).
