# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Context

Personal Claude assistant. Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Workflow

After completing each feature or logical unit of work, always commit all related changes and push to `main`. Don't wait for the user to ask — commit and push proactively once the feature is done and verified.

## Development Commands

Run commands directly—don't tell the user to run them.

```bash
npm run dev              # Run with hot reload (tsx)
npm run build            # Compile TypeScript (tsc)
npm run typecheck        # Type-check without emitting
npm test                 # Run all tests (vitest run)
npm run test:watch       # Watch mode
npx vitest run src/channels/slack.test.ts  # Run a single test file
npm run format:check     # Check formatting (prettier)
npm run format:fix       # Auto-format (also runs on pre-commit via husky)
./container/build.sh     # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Architecture

```
Channels --> SQLite --> Polling loop --> Container (Claude Agent SDK) --> Response
```

**Channel self-registration:** Each channel file calls `registerChannel()` at import time. `src/channels/index.ts` barrel-imports all channels to trigger registration. The orchestrator connects whichever ones have credentials present.

**Channel interface:** All channels implement `Channel` from `src/types.ts` — `connect()`, `sendMessage()`, `isConnected()`, `ownsJid()`, `disconnect()`, optional `setTyping()` and `syncGroups()`.

**Container execution:** Agents run in isolated Linux containers (Docker or Apple Container). Input via JSON on stdin (secrets), output via JSON on stdout. IPC via filesystem (`/workspace/ipc/`). Container image built from `container/Dockerfile` (node:22-slim + Chromium).

**Database:** Synchronous SQLite via better-sqlite3. For tests, use `_initTestDatabase()` to reset state.

## Code Conventions

- **ESM with `.js` extensions:** All imports use `.js` extension (`import { foo } from './file.js'`)
- **Config access:** Use `readEnvFile(['KEY'])` from `src/config.ts`, not `process.env` directly
- **Logging:** Use `logger` from `src/logger.ts` (Pino) — `logger.info({ key: 'value' }, 'message')`
- **Formatting:** Single quotes (prettier config). Pre-commit hook auto-formats via husky
- **Testing:** Vitest with `vi.mock()` for module mocking. Tests go alongside source as `*.test.ts`. Also covers `setup/` and `skills-engine/` directories

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/channels/index.ts` | Barrel imports to trigger channel registration |
| `src/types.ts` | Core interfaces (Channel, NewMessage, RegisteredGroup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/agent-runner/` | Node.js app that runs inside the container |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

### Skill Package Structure

Skills live in `.claude/skills/<skill-name>/` and are applied via the skills engine. Structure:

```
.claude/skills/add-<name>/
├── SKILL.md                        # Instructions for Claude Code (phased install guide)
├── manifest.yaml                   # Metadata: adds, modifies, deps, npm packages, env vars
├── add/                            # New files (paths mirror project root)
│   └── src/channels/foo.ts         # Copied to src/channels/foo.ts
├── modify/                         # Changes to existing files
│   └── src/channels/
│       ├── index.ts                # Target state of the file after merge
│       └── index.ts.intent.md      # Intent description (for conflict resolution)
└── tests/                          # Tests that validate the skill package itself
    └── foo.test.ts
```

**manifest.yaml** declares everything declaratively:

```yaml
skill: <name>
version: 1.0.0
description: "..."
core_version: 0.1.0
adds:                              # New files to create
  - src/channels/foo.ts
  - src/channels/foo.test.ts
modifies:                          # Existing files to merge into
  - src/channels/index.ts
structured:
  npm_dependencies:                # Auto-installed
    "some-package": "^1.0.0"
  env_additions:                   # Required env vars
    - SOME_TOKEN
conflicts: []                      # Mutually exclusive skills
depends: []                        # Required prerequisite skills
test: "npx vitest run src/channels/foo.test.ts"
```

**SKILL.md** phases: (1) Pre-flight — check `.nanoclaw/state.yaml` if already applied, (2) Apply — run `npx tsx scripts/apply-skill.ts .claude/skills/add-<name>`, (3) Setup — interactive config (tokens, env), (4) Registration — register groups/channels, (5) Verify.

**modify/ files**: contain the **target state** of the file after applying the skill, not a diff. The companion `.intent.md` describes the change's purpose so Claude can resolve merge conflicts intelligently.

**Apply command:** `npx tsx scripts/apply-skill.ts .claude/skills/add-<name>` — copies `add/` files, merges `modify/` files, installs npm deps, records state in `.nanoclaw/state.yaml`. The skills engine lives in `skills-engine/`.

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` to install it. Existing auth credentials and groups are preserved.

**Container build cache:** The container buildkit caches aggressively. `--no-cache` alone does NOT invalidate COPY steps. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.
