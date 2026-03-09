# iCloud Calendar (icloud-cal)

You have access to the `icloud-cal` command-line tool for reading iCloud Calendar events.

## Usage

```bash
icloud-cal list-calendars          # list all calendars
icloud-cal today                   # today's events
icloud-cal tomorrow                # tomorrow's events
icloud-cal week                    # next 7 days
icloud-cal events --days 3         # next N days
icloud-cal events --calendar Práce # filter by calendar name
```

## Output format

All commands output JSON to stdout:

**list-calendars:**
```json
[
  { "displayName": "Osobní", "url": "https://...", "color": "#FF2D55" },
  { "displayName": "Práce", "url": "https://...", "color": "#007AFF" }
]
```

**events / today / tomorrow / week:**
```json
[
  {
    "title": "Schůzka s Tomášem",
    "start": "2026-03-10T10:00:00",
    "end": "2026-03-10T11:00:00",
    "calendar": "Práce",
    "location": "Kancelář",
    "notes": "Přinést nabídku",
    "allDay": false,
    "recurring": false
  }
]
```

## Notes

- Credentials come from `APPLE_ID` and `APPLE_APP_PASS` environment variables — already configured
- All-day events have `"allDay": true` and times set to midnight
- Recurring events are expanded — each instance appears as a separate object
- If no events, returns empty array `[]`
- Errors go to stderr; check exit code before parsing stdout
