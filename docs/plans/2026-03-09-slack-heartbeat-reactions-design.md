# Slack Heartbeat Reactions

## Problem

When the agent processes a message, users see an hourglass reaction but no further updates until completion. For long-running tasks, it's impossible to tell if the agent is working or stalled.

## Solution

Rotate Slack reactions on the trigger message every 10 seconds between `:hourglass_flowing_sand:` and `:hourglass:` while the container is running.

## Implementation

### HeartbeatConfig interface

```typescript
interface HeartbeatConfig {
  channel: Channel;
  chatJid: string;
  messageId: string;
  intervalMs?: number; // default 10_000
  emojis?: [string, string]; // default ['hourglass_flowing_sand', 'hourglass']
}
```

### container-runner.ts

- `runContainerAgent` accepts optional `HeartbeatConfig`
- After spawning the container, start `setInterval(10_000)` that rotates between the two emojis (remove current, add next)
- Stop interval in `finally` block (covers success, error, timeout)
- Skip tick if previous remove+add is still in-flight (prevent overlapping API calls)

### src/index.ts (orchestrator)

- Pass `HeartbeatConfig` to `runContainerAgent` instead of manually adding/removing hourglass
- Final reactions (checkmark/X) remain in orchestrator after container completes

### Edge cases

- Slack rate limiting: existing `addReaction`/`removeReaction` already handle errors gracefully
- Container crash: `finally` block stops interval reliably
- Piped messages: heartbeat runs for entire container lifetime, independent of piped messages

## Scope

- Slack only (WhatsApp has StatusTracker, other channels not needed)
- No new dependencies
