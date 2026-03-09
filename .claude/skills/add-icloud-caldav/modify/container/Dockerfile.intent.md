# Intent: container/Dockerfile modifications

## What changed
Added iCloud CalDAV support via globally installed npm packages and a CLI script.

## Key sections

### After npm global installs (agent-browser, claude-code, ms365)
- Added: `RUN npm install -g tsdav ical.js` as a separate layer for iCloud CalDAV dependencies

### After TypeScript build
- Added: `COPY skills/icloud-caldav/icloud-cal /usr/local/bin/icloud-cal` to install CLI script
- Added: `RUN chmod +x /usr/local/bin/icloud-cal` to make it executable

## Invariants (must-keep)
- All Chromium dependencies unchanged
- agent-browser, claude-code, ms365 npm global installs unchanged
- WORKDIR, COPY agent-runner, npm install, npm run build sequence unchanged
- Workspace directory creation unchanged
- Entrypoint script unchanged
- User switching (node user) unchanged
- ENTRYPOINT unchanged
