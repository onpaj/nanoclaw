# Intent: container/Dockerfile modifications

## What changed
Added Microsoft 365 MCP server so the container agent can call MS Graph API tools.

## Key sections

### npm global installs (RUN npm install -g ...)
- Added: `@softeria/ms-365-mcp-server` to the global npm install line
- Before: `RUN npm install -g agent-browser @anthropic-ai/claude-code`
- After:  `RUN npm install -g agent-browser @anthropic-ai/claude-code @softeria/ms-365-mcp-server`

## Invariants (must-keep)
- All Chromium apt dependencies unchanged
- ENV variables for Chromium unchanged
- WORKDIR, COPY, npm install, npm run build sequence unchanged
- Workspace directory creation unchanged
- Entrypoint script unchanged
- User switching (node user) unchanged
- ENTRYPOINT unchanged
