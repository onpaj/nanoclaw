# Self-Improving Container Agent — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Container agent logs learnings, errors, and feature requests from user interactions, and auto-promotes important patterns to its group CLAUDE.md.

**Architecture:** Hook scripts inside the Docker image remind the agent to log learnings after errors and tasks. Instructions in global CLAUDE.md define the logging format and auto-promotion rules. Per-group `.learnings/` directories persist across sessions.

**Tech Stack:** Bash (hook scripts), TypeScript (settings generation), Claude Agent SDK hooks

---

### Task 1: Create hook scripts

**Files:**
- Create: `container/hooks/self-improvement/activator.sh`
- Create: `container/hooks/self-improvement/error-detector.sh`

**Step 1: Create activator hook**

```bash
#!/bin/bash
# Self-Improvement Activator Hook
# Triggers on UserPromptSubmit — reminds agent to evaluate learnings after tasks
set -e

cat << 'EOF'
<self-improvement-reminder>
After completing this task, evaluate if extractable knowledge emerged:
- User corrected you or provided new personal info?
- Non-obvious solution discovered through investigation?
- Tool/API failed unexpectedly?
- User requested a capability you don't have?

If yes: Log to /workspace/group/.learnings/ using the format in your instructions.
If broadly applicable (recurring pattern, user preference): Promote to /workspace/group/CLAUDE.md.
</self-improvement-reminder>
EOF
```

Create `container/hooks/self-improvement/activator.sh` with this content.

**Step 2: Create error-detector hook**

```bash
#!/bin/bash
# Self-Improvement Error Detector Hook
# Triggers on PostToolUse for Bash — detects command failures
set -e

OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"

ERROR_PATTERNS=(
    "error:" "Error:" "ERROR:" "failed" "FAILED"
    "command not found" "No such file" "Permission denied"
    "fatal:" "Exception" "Traceback" "npm ERR!"
    "ModuleNotFoundError" "SyntaxError" "TypeError"
    "exit code" "non-zero"
)

contains_error=false
for pattern in "${ERROR_PATTERNS[@]}"; do
    if [[ "$OUTPUT" == *"$pattern"* ]]; then
        contains_error=true
        break
    fi
done

if [ "$contains_error" = true ]; then
    cat << 'EOF'
<error-detected>
A command error was detected. Consider logging to /workspace/group/.learnings/ERRORS.md if:
- The error was unexpected or non-obvious
- It required investigation to resolve
- It might recur in similar contexts

Use format: ## [ERR-YYYYMMDD-XXX] tool_or_command
</error-detected>
EOF
fi
```

Create `container/hooks/self-improvement/error-detector.sh` with this content.

**Step 3: Verify scripts are executable**

Run: `chmod +x container/hooks/self-improvement/*.sh`

**Step 4: Commit**

```bash
git add container/hooks/self-improvement/
git commit -m "feat: add self-improvement hook scripts for container agent"
```

---

### Task 2: Bake hooks into Docker image

**Files:**
- Modify: `container/Dockerfile`

**Step 1: Add COPY for hooks**

After the existing `COPY skills/icloud-caldav/icloud-cal /usr/local/bin/icloud-cal` line, add:

```dockerfile
# Copy self-improvement hooks
COPY hooks/ /app/hooks/
RUN chmod +x /app/hooks/self-improvement/*.sh
```

**Step 2: Rebuild container and verify hooks exist**

Run: `./container/build.sh`
Run: `docker run --rm nanoclaw-agent:latest ls -la /app/hooks/self-improvement/`
Expected: Both `activator.sh` and `error-detector.sh` listed with execute permission.

**Step 3: Commit**

```bash
git add container/Dockerfile
git commit -m "feat: bake self-improvement hooks into container image"
```

---

### Task 3: Add hooks to per-group settings.json

**Files:**
- Modify: `src/container-runner.ts:119-148`

**Step 1: Write failing test**

Create `src/container-runner.test.ts` (or add to existing test) that verifies `writeGroupSettings` produces a settings.json with hooks config.

Actually — the settings are written inline in `buildVolumeMounts`. We need to refactor the settings writing to always update hooks even if the file exists.

**Step 2: Modify settings generation**

Replace the current settings.json writing block (lines 127-148) with logic that:
1. Reads existing settings.json if present
2. Merges/overwrites `env` and `hooks` keys
3. Writes back

```typescript
// Always update per-group settings (env + hooks)
const desiredSettings = {
  env: {
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
  },
  hooks: {
    UserPromptSubmit: [{
      matcher: '',
      hooks: [{
        type: 'command',
        command: '/app/hooks/self-improvement/activator.sh',
      }],
    }],
    PostToolUse: [{
      matcher: 'Bash',
      hooks: [{
        type: 'command',
        command: '/app/hooks/self-improvement/error-detector.sh',
      }],
    }],
  },
};

// Merge with existing settings (preserve any custom keys)
let existing: Record<string, unknown> = {};
if (fs.existsSync(settingsFile)) {
  try {
    existing = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
  } catch { /* corrupt file, overwrite */ }
}
const merged = { ...existing, ...desiredSettings };
fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2) + '\n');
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/container-runner.ts
git commit -m "feat: add self-improvement hooks to per-group container settings"
```

---

### Task 4: Initialize .learnings/ templates per group

**Files:**
- Modify: `src/container-runner.ts` (in `buildVolumeMounts` or before container spawn)

**Step 1: Add .learnings/ initialization**

After `fs.mkdirSync(groupDir, { recursive: true })` in `runContainerAgent`, add initialization of `.learnings/` with template files:

```typescript
// Initialize .learnings/ for self-improvement tracking
const learningsDir = path.join(groupDir, '.learnings');
if (!fs.existsSync(learningsDir)) {
  fs.mkdirSync(learningsDir, { recursive: true });
  fs.writeFileSync(
    path.join(learningsDir, 'LEARNINGS.md'),
    '# Learnings Log\n\nCaptured learnings, corrections, and discoveries.\n\n---\n',
  );
  fs.writeFileSync(
    path.join(learningsDir, 'ERRORS.md'),
    '# Errors Log\n\nCommand failures, exceptions, and unexpected behaviors.\n\n---\n',
  );
  fs.writeFileSync(
    path.join(learningsDir, 'FEATURE_REQUESTS.md'),
    '# Feature Requests\n\nCapabilities requested by user that don\'t currently exist.\n\n---\n',
  );
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/container-runner.ts
git commit -m "feat: initialize .learnings/ templates for new groups"
```

---

### Task 5: Add self-improvement instructions to global CLAUDE.md

**Files:**
- Modify: `groups/global/CLAUDE.md`

**Step 1: Append self-improvement section**

Add the following section to the end of `groups/global/CLAUDE.md`:

```markdown
## Self-Improvement

You continuously improve by logging learnings from interactions. Three log files in `/workspace/group/.learnings/`:

| File | What to log |
|------|-------------|
| LEARNINGS.md | User corrections ("No, I live in Prague"), preferences, knowledge gaps, better approaches |
| ERRORS.md | Tool/command failures, API errors, unexpected behaviors |
| FEATURE_REQUESTS.md | "Can you also...", "I wish you could...", capabilities user wants |

### When to Log

- User corrects you → LEARNINGS.md (category: correction)
- User shares personal info/preference → LEARNINGS.md (category: user_preference)
- Command or tool fails unexpectedly → ERRORS.md
- You discover your knowledge was wrong → LEARNINGS.md (category: knowledge_gap)
- User requests missing capability → FEATURE_REQUESTS.md
- You find a better approach for something → LEARNINGS.md (category: best_practice)

### Entry Format

```
## [LRN-YYYYMMDD-XXX] category

**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high
**Status**: pending

### Summary
One-line description

### Details
Full context

### Suggested Action
Specific improvement to make
```

Use ERR- prefix for errors, FEAT- for feature requests. XXX = sequential number (001, 002...).

### Auto-Promotion to CLAUDE.md

When a learning is important enough to affect all future interactions, promote it by adding a concise rule to `/workspace/group/CLAUDE.md`. Promote when:

- User preference applies broadly (language, communication style, personal info)
- Pattern has recurred 2+ times (link with See Also in entries)
- Knowledge any future session needs (project conventions, tool gotchas)

After promoting: update the entry status to `promoted` and note where it was added.

### Resolving Entries

When an issue is fixed, change `**Status**: pending` → `**Status**: resolved` and add:

```
### Resolution
- **Resolved**: ISO-8601 timestamp
- **Notes**: What was done
```

### Review

Before starting complex tasks, quickly scan `.learnings/` for relevant past entries. Link related entries with `**See Also**: LRN-20260309-001`.
```

**Step 2: Commit**

```bash
git add groups/global/CLAUDE.md
git commit -m "feat: add self-improvement instructions to global agent prompt"
```

---

### Task 6: Rebuild container and end-to-end test

**Step 1: Rebuild container image**

Run: `./container/build.sh`
Expected: Build succeeds, hooks are present in image.

**Step 2: Verify hooks in image**

Run: `docker run --rm nanoclaw-agent:latest ls -la /app/hooks/self-improvement/`
Expected: Both scripts listed with +x.

Run: `docker run --rm nanoclaw-agent:latest /app/hooks/self-improvement/activator.sh`
Expected: Outputs `<self-improvement-reminder>` block.

Run: `docker run --rm -e CLAUDE_TOOL_OUTPUT="Error: command not found" nanoclaw-agent:latest /app/hooks/self-improvement/error-detector.sh`
Expected: Outputs `<error-detected>` block.

**Step 3: Verify settings generation**

Delete an existing group's settings.json and restart to verify it gets recreated with hooks:

Run: Check any group's settings at `/data/sessions/{group}/.claude/settings.json`
Expected: Contains both `env` and `hooks` keys.

**Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: self-improving container agent with hooks and learnings"
git push
```
