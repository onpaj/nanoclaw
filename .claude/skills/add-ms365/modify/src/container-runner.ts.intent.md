# Intent: src/container-runner.ts modifications

## What changed
Added Microsoft 365 credentials to the secrets passed into the container via stdin,
so the ms365 MCP server subprocess inside the container can authenticate with Azure AD.

## Key sections

### readSecrets() function
- Added: `'MS365_CLIENT_ID'` to the readEnvFile() allowlist
- Added: `'MS365_CLIENT_SECRET'` to the readEnvFile() allowlist
- Added: `'MS365_TENANT_ID'` to the readEnvFile() allowlist

These values are read from the host `.env` file and passed to the container via stdin JSON
(never written to disk, never mounted as files). Inside the container, `sdkEnv` makes them
available as environment variables for the ms365 MCP server subprocess.

## Invariants (must-keep)
- CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN unchanged
- All container spawn logic unchanged
- All volume mount logic unchanged
- All IPC logic unchanged
- Timeout logic unchanged
