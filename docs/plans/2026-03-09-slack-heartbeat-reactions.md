# Slack Heartbeat Reactions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rotate Slack reactions (⏳↔⌛) every 10s on the trigger message while the container agent is running, so users can tell the agent hasn't stalled.

**Architecture:** Add a `HeartbeatConfig` option to `runContainerAgent`. When provided, the container runner starts an interval timer that alternates between two emoji reactions. The orchestrator passes the config instead of manually managing hourglass reactions.

**Tech Stack:** Node.js, TypeScript, Vitest

---

### Task 1: Add heartbeat logic to container-runner

**Files:**
- Modify: `src/container-runner.ts:31-32` (imports/types)
- Modify: `src/container-runner.ts:297-302` (function signature)
- Modify: `src/container-runner.ts:339-344` (after spawn, start heartbeat)
- Modify: `src/container-runner.ts:468` (on close, stop heartbeat)
- Test: `src/container-runner.test.ts`

**Step 1: Write the failing test**

Add to `src/container-runner.test.ts`:

```typescript
describe('heartbeat reactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rotates emoji reactions every interval', async () => {
    const addReaction = vi.fn(async () => {});
    const removeReaction = vi.fn(async () => {});
    const channel = { addReaction, removeReaction } as any;

    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      undefined,
      {
        channel,
        chatJid: 'test@g.us',
        messageId: 'msg-1',
        intervalMs: 10_000,
        emojis: ['hourglass_flowing_sand', 'hourglass'] as [string, string],
      },
    );

    // Initial state: hourglass_flowing_sand is already on the message (added by orchestrator)
    // After 10s: should swap to hourglass
    await vi.advanceTimersByTimeAsync(10_000);
    expect(removeReaction).toHaveBeenCalledWith('test@g.us', 'msg-1', 'hourglass_flowing_sand');
    expect(addReaction).toHaveBeenCalledWith('test@g.us', 'msg-1', 'hourglass');

    // After 20s: should swap back to hourglass_flowing_sand
    await vi.advanceTimersByTimeAsync(10_000);
    expect(removeReaction).toHaveBeenCalledWith('test@g.us', 'msg-1', 'hourglass');
    expect(addReaction).toHaveBeenCalledWith('test@g.us', 'msg-1', 'hourglass_flowing_sand');

    // Close container
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
  });

  it('stops heartbeat on container close', async () => {
    const addReaction = vi.fn(async () => {});
    const removeReaction = vi.fn(async () => {});
    const channel = { addReaction, removeReaction } as any;

    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      undefined,
      {
        channel,
        chatJid: 'test@g.us',
        messageId: 'msg-1',
        intervalMs: 10_000,
        emojis: ['hourglass_flowing_sand', 'hourglass'] as [string, string],
      },
    );

    // One tick
    await vi.advanceTimersByTimeAsync(10_000);
    const callsAfterFirstTick = addReaction.mock.calls.length;

    // Close container
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    // Advance more — no additional calls
    await vi.advanceTimersByTimeAsync(30_000);
    expect(addReaction.mock.calls.length).toBe(callsAfterFirstTick);

    await resultPromise;
  });

  it('skips tick if previous swap is still in-flight', async () => {
    let resolveSwap!: () => void;
    const addReaction = vi.fn(() => new Promise<void>((r) => { resolveSwap = r; }));
    const removeReaction = vi.fn(async () => {});
    const channel = { addReaction, removeReaction } as any;

    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      undefined,
      {
        channel,
        chatJid: 'test@g.us',
        messageId: 'msg-1',
        intervalMs: 10_000,
        emojis: ['hourglass_flowing_sand', 'hourglass'] as [string, string],
      },
    );

    // First tick starts swap (addReaction hangs)
    await vi.advanceTimersByTimeAsync(10_000);
    expect(addReaction).toHaveBeenCalledTimes(1);

    // Second tick fires while first is still in-flight — should be skipped
    await vi.advanceTimersByTimeAsync(10_000);
    expect(addReaction).toHaveBeenCalledTimes(1); // still 1

    // Resolve the pending swap
    resolveSwap();
    await vi.advanceTimersByTimeAsync(10);

    // Close container
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/container-runner.test.ts`
Expected: FAIL — `runContainerAgent` doesn't accept 5th parameter

**Step 3: Write implementation**

Add the `HeartbeatConfig` interface and modify `runContainerAgent` in `src/container-runner.ts`:

```typescript
// Add after ContainerOutput interface (~line 52)
export interface HeartbeatConfig {
  channel: {
    addReaction?(jid: string, messageId: string, emoji: string): Promise<void>;
    removeReaction?(jid: string, messageId: string, emoji: string): Promise<void>;
  };
  chatJid: string;
  messageId: string;
  intervalMs?: number;
  emojis?: [string, string];
}
```

Modify `runContainerAgent` signature to add optional `heartbeat?: HeartbeatConfig` as 5th parameter.

Inside the function, after `onProcess(container, containerName)` (~line 344), add:

```typescript
// Heartbeat: rotate emoji reactions so users can see the agent is alive
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
if (heartbeat) {
  const emojis = heartbeat.emojis ?? ['hourglass_flowing_sand', 'hourglass'];
  const intervalMs = heartbeat.intervalMs ?? 10_000;
  let currentIdx = 0; // 0 = first emoji (already shown by orchestrator)
  let swapping = false;

  heartbeatInterval = setInterval(async () => {
    if (swapping) return;
    swapping = true;
    try {
      const prev = emojis[currentIdx];
      currentIdx = (currentIdx + 1) % emojis.length;
      const next = emojis[currentIdx];
      await heartbeat.channel.removeReaction?.(heartbeat.chatJid, heartbeat.messageId, prev);
      await heartbeat.channel.addReaction?.(heartbeat.chatJid, heartbeat.messageId, next);
    } catch (err) {
      logger.debug({ err }, 'Heartbeat reaction swap failed');
    } finally {
      swapping = false;
    }
  }, intervalMs);
}
```

In the `container.on('close')` handler, add `if (heartbeatInterval) clearInterval(heartbeatInterval);` right after `clearTimeout(timeout);` (~line 469).

Also add the same cleanup in `container.on('error')` handler (~line 663).

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/container-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/container-runner.ts src/container-runner.test.ts
git commit -m "feat: add heartbeat reaction rotation to container runner"
```

---

### Task 2: Wire heartbeat into orchestrator

**Files:**
- Modify: `src/index.ts:213-219` (replace manual hourglass add with heartbeat config)
- Modify: `src/index.ts:268-276` (remove manual hourglass remove — heartbeat handles it)

**Step 1: Modify processGroupMessages in `src/index.ts`**

The orchestrator currently:
1. Adds ⏳ before spawning container (line 215-219)
2. Removes ⏳ and adds ✅/❌ after container finishes (lines 268-276)

Change to:
1. Still add initial ⏳ (the heartbeat starts rotating from this state)
2. Pass `HeartbeatConfig` to `runAgent` → `runContainerAgent`
3. After container finishes, the heartbeat is already stopped. Remove whatever emoji is current, add ✅/❌

In `runAgent` function (~line 323), pass heartbeat config through to `runContainerAgent`:

```typescript
async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
  heartbeat?: import('./container-runner.js').HeartbeatConfig,
): Promise<'success' | 'error'> {
```

And pass it through:

```typescript
const output = await runContainerAgent(
  group,
  { ... },
  (proc, containerName) => ...,
  wrappedOnOutput,
  heartbeat,
);
```

In `processGroupMessages`, build heartbeat config for Slack channels:

```typescript
// Build heartbeat config if channel supports reactions
const heartbeatConfig: HeartbeatConfig | undefined =
  channel.addReaction && channel.removeReaction
    ? {
        channel,
        chatJid,
        messageId: triggerMessageId,
      }
    : undefined;
```

Pass it to `runAgent`:

```typescript
const output = await runAgent(group, prompt, chatJid, async (result) => { ... }, heartbeatConfig);
```

Update the cleanup after container finishes — need to remove both possible emojis since we don't know which one is showing:

```typescript
// Replace ⏳/⌛ with ✅ or ❌ based on outcome
const completionEmoji = output === 'error' || hadError ? 'x' : 'white_check_mark';
// Remove both heartbeat emojis (one is active, the other is already gone — removeReaction handles gracefully)
await channel.removeReaction?.(chatJid, triggerMessageId, 'hourglass_flowing_sand');
await channel.removeReaction?.(chatJid, triggerMessageId, 'hourglass');
await channel.addReaction?.(chatJid, triggerMessageId, completionEmoji);
```

**Step 2: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire heartbeat reactions into orchestrator for Slack"
```

---

### Task 3: Manual verification

**Step 1: Build and run**

```bash
npm run build
```

**Step 2: Test locally**

Send a message to Slack that triggers the agent. Watch the trigger message — the reaction should alternate between ⏳ and ⌛ every 10 seconds, then settle on ✅ or ❌.

**Step 3: Push**

```bash
git push
```
