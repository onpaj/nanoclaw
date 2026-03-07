# Intent: container/agent-runner/src/index.ts modifications

## What changed
Added Microsoft 365 MCP server configuration so the container agent can interact with
Outlook email, calendar, and other MS365 services via Microsoft Graph API.

## Key sections

### allowedTools array (inside runQuery → options)
- Added: `'mcp__ms365__*'` to the allowedTools array (after `'mcp__nanoclaw__*'`)

### mcpServers object (inside runQuery → options)
- Added: `ms365` entry as a stdio MCP server
  - command: `'ms-365-mcp-server'` (global npm binary installed in container)
  - args: `['--preset', 'mail,calendar']` (only mail and calendar tools loaded)
  - env: passes `MS365_CLIENT_ID`, `MS365_CLIENT_SECRET`, `MS365_TENANT_ID` from sdkEnv

## Invariants (must-keep)
- All existing allowedTools entries unchanged
- nanoclaw MCP server config unchanged
- All other query options (permissionMode, hooks, env, etc.) unchanged
- MessageStream class unchanged
- IPC polling logic unchanged
- Session management unchanged
