# To Do → Planner Migration

You have access to a migration script that moves personal tasks from Microsoft To Do to a Planner plan.

## When to Use

When the user asks to migrate, sync, or move their To Do tasks to Planner.

## Usage

```bash
# Preview what would be migrated (no changes)
node /home/node/.claude/skills/todo-to-planner/migrate.mjs --dry-run

# Migrate all personal tasks to "Personal" plan
node /home/node/.claude/skills/todo-to-planner/migrate.mjs

# Migrate from a specific To Do list only
node /home/node/.claude/skills/todo-to-planner/migrate.mjs --list "Shopping"

# Use a specific Planner plan ID (if auto-discovery fails)
node /home/node/.claude/skills/todo-to-planner/migrate.mjs --plan-id "abc123"
```

## What It Does

1. Reads all To Do task lists via Microsoft Graph API
2. Identifies "personal" tasks — those without a linked Planner resource
3. Creates matching tasks in the Planner "Personal" plan (title, due date, priority, status, description)
4. Deletes the original To Do tasks after successful migration

## Output

- Progress is logged to stderr
- Final summary is printed to stdout as JSON: `{"migrated": N, "failed": N, "total": N}`

## Important

- Always run with `--dry-run` first to preview
- Tasks already linked to Planner are skipped (they stay in To Do)
- Completed tasks are migrated as completed (percentComplete: 100)
- If the "Personal" plan is not found, the script will error — use `--plan-id` as fallback
- Requires MS365 credentials (already configured via environment)
