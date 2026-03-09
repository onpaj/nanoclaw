# Intent: src/container-runner.ts modifications

## What changed
Added iCloud CalDAV credentials to the secrets passed into the container,
so the `icloud-cal` CLI script inside the container can authenticate with iCloud.

## Key sections

### readSecrets() function
- Added: `'APPLE_ID'` to the readEnvFile() allowlist
- Added: `'APPLE_APP_PASS'` to the readEnvFile() allowlist

These values are read from the host `.env` file and injected into the container environment.
Inside the container, `icloud-cal` reads them from `process.env`.

## Invariants (must-keep)
- All existing secrets (CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, MS365_*) unchanged
- All container spawn logic unchanged
- All volume mount logic unchanged
- All IPC logic unchanged
- Timeout logic unchanged
