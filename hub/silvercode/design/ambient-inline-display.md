# Ambient inline display

**Tracking:** [`km-silvercode.ambient-inline-display`](bd-show:km-silvercode.ambient-inline-display) — Phase 6.a of [`ambient-context-safety.md`](./ambient-context-safety.md).

**Goal:** when an ambient event is auto-delivered to the agent (via `assembleAcpPrompt` → typed `EmbeddedResource`), the chat scrollback also shows it inline as a styled observation row, between turns, at its actual injection timestamp. Equivalent to Claude Code's inline tribe-message display: the user can _see_ what the agent is seeing, without ambient noise being dressed up as a user turn.

This is a UI-only feature. The agent receives the same typed ACP blocks regardless of what the inline display shows. Mute toggles on the side panel are a visual filter — they hide rows from the user, not from the agent.

---

## Why inline (not side panel)

The previous posture was "queue ambient in side panel; user opts in to inject." That changed (see `ambient-context-safety.md` § "Posture: auto-deliver, framed as observation"): events flow into the agent automatically. The user no longer batches or routes them — but they still want to see the firehose, scoped to where it actually entered the conversation.

The right place is inline, in time order, between turns. The user reads the scrollback like a journal: "I asked X; ambient hit Y, Z; agent did W." The mental model is "this is what was on the table when the next turn happened" — not "here is a separate inbox of stuff that may or may not have reached the agent."

---

## Visual spec

One row per ambient event, between turn entries. Distinct from user/assistant rows but visually quiet — ambient is background, not foreground.

```
> can you summarise what alice is up to
                                          ← user (existing)
   tribe   17:42  peer alice opened PR #42    [▸]
   ci      17:43  passed: 245 tests           [▸]
   recall  17:43  hit: feedback-quiet-tribe-ack [▸]
                                          ← ambient rows (new)
● Alice opened PR #42 about an hour ago…
                                          ← assistant (existing)
```

- **Source icon + label** (left gutter, 8 cols): `tribe / ci / recall / sub-agent / file-watch / telegram`. Token color from a per-source palette (`$muted` baseline, `$info` for tribe, `$success` for green CI, `$warning` for amber, `$error` for failed CI). The label is the source key — short, lowercase, parseable.
- **Timestamp** (next 6 cols): `HH:MM` rendered as `Small` muted text, anchored to `event.timestamp`.
- **Payload preview** (rest of the row): one line, truncated with ellipsis. The full body sits behind the row in a popover.
- **Background**: `$bg-surface-subtle` — same surface color the existing `UserRow` and `BackgroundSystemRow` use, so ambient sits visually with system rows, not with user prose.
- **Prefix label**: `[AMBIENT — observation]` is _implied by row chrome_, not spelled out as text on every row. The agent-facing framing (`AMBIENT_FRAMING_PREFIX` from `prompt-assembly.ts`) stays in the LLM payload; the inline UI uses styling instead, because rendering the literal frame on every row is noise.
- **Expand affordance**: a `▸ / ▾` glyph at the end of the row. Click to expand inline, showing the full payload body below the row in a `$bg-surface-subtle` panel. Hover shows a popover preview (consistent with the `RawInspector` / popover patterns silvercode already uses).
- **Per-source mute** (side panel): when a source is muted, its rows do not render in the scrollback. The mute toggle does NOT call `channelQueue.clear()` or affect `assembleAcpPrompt` — the agent still sees them.

---

## Data model

Ambient events live alongside `MessageEntry[]` from `session-store.ts`, but they are NOT messages. They have their own typed shape.

```ts
// apps/silvercode/src/ambient-stream.ts
export type AmbientStreamEntry = {
  readonly kind: "ambient"
  readonly id: string             // matches ChannelEvent.id
  readonly source: string         // tribe / ci / recall / subagent / file-watch / telegram / ...
  readonly timestamp: number      // epoch ms — ordering anchor
  readonly content: string        // payload body (already sanitized at Layer 2)
  readonly actionable?: boolean   // hint flag (informational vs action-cue)
}
```

The chat surface receives a merged stream:

```ts
type ScrollbackItem =
  | { kind: "message"; entry: MessageEntry }
  | { kind: "ambient"; entry: AmbientStreamEntry }
  | { kind: "activity" }
```

Merge rule: interleave `MessageEntry[]` and `AmbientStreamEntry[]` by `ts` / `timestamp` ascending. Stable sort: equal timestamps keep insertion order. The activity sentinel stays at the tail when status ≠ idle (existing pattern).

**Where ambient rows come from at runtime:** the controller already receives ambient events through `channelQueue.subscribe(...)` — see `controller.ts` line ~455. We add a per-session ambient ring buffer keyed by `sessionId` (or all-sessions for a global feed); when an ambient event is delivered to a session's prompt assembly, we also push it into that session's ambient stream. `useAmbientStream(sessionId)` is the hook the UI binds to.

**Storage:** in-memory only, ordered, no persistence. Same lifetime guarantees as `channelQueue` — bound to the controller scope. A daemon restart drops history, which matches the existing posture.

---

## Integration points

1. **`AmbientEventRow.tsx`** (new) — pure presentational component. Inputs: `entry: AmbientStreamEntry`, `expanded: boolean`, `onToggleExpand: () => void`. Outputs: a row matching the visual spec. Owns its own hover state. NO knowledge of mute filters, of the session, or of how it got here.
2. **`SessionUpdateList.tsx`** — extend to accept an optional `ambientEntries: AmbientStreamEntry[]` prop. When passed, merge with `messages` by timestamp, dispatch on item kind in `renderItem`. When omitted, current behaviour. Mute filter is applied at the `SessionCard` level, not here — by the time entries arrive, they're already filtered.
3. **`SessionCard.tsx`** — pull ambient stream via `useAmbientStream(handle.id)`, apply per-source mute filter (read from a new `mutedSources` signal), pass the filtered list to `SessionUpdateList`.
4. **`SidePanel.tsx`** — add an "Ambient" section. One row per source with a checkbox-style toggle (`☐` / `☑`). Clicking toggles the source's entry in the `mutedSources` signal. Live count of total events per source as muted text suffix. Hover popover explains "muting hides rows from the inline view; the agent still receives them."
5. **`ambient-stream.ts`** (new) — `createAmbientStream(scope)` factory. Two methods: `record(sessionId, event)` (controller calls), `read(sessionId): AmbientStreamEntry[]` (UI calls). One alien-signals `signal` per session for reactivity.
6. **`controller.ts`** — wire `channelQueue.subscribe` to also call `ambientStream.record(focusedId, event)` for whichever session(s) consumed the event in `assembleAcpPrompt`. (Phase 6.a: write to focused session only; future phases can attribute by who actually drained.)
7. **`mute-state.ts`** (new) — `createMuteState(scope)`. Persists to `~/.config/silvercode/mute-state.json` (so toggles survive restarts). Reactive signal of `Set<string>`.

---

## Mute-toggle wiring

Side panel "Ambient" section reads from `controller.muteState`. Clicking a source row calls `controller.muteState.toggle(source)`. The `mutedSources` signal updates → `SessionCard` re-runs the filter → rows for that source disappear from the scrollback.

Critical: the mute state never reaches `assembleAcpPrompt`, never reaches `channelQueue.drain*`, never reaches the controller's broadcast subscriber. The agent gets every event regardless. This is enforced structurally — `mute-state.ts` exports only `read(): Set<string>` and `toggle(source)`; nothing in `prompt-assembly.ts` or `channel-sources.ts` imports it.

The hover popover on each side-panel mute row spells this out so the user does not assume mute = "stop telling the agent."

---

## Accessibility notes

- Source icon + label is the primary signal. Color is secondary — every row passes a `$muted`-vs-`$fg` contrast check independent of source color.
- Keyboard: Tab into a row reveals expand glyph as a focusable button. Enter / Space toggles expand. Arrow-Up/Down moves between ambient rows when the scrollback is focused (existing ListView nav extends).
- Screen readers: `aria-label="ambient observation from <source> at <time>"`. The expanded body uses the same `<MarkdownView>` as assistant text for consistent navigation.
- Mute toggles have `role="switch"` + accessible labels; the help text is announced via the popover.

---

## Test surface (Phase 6.a deliverables)

1. Storybook story: 6 sources rendered side by side (one per source kind).
2. Storybook story: full chat sequence — user → assistant → 2× ambient → user → assistant — proves time-order interleaving renders correctly.
3. Component test (`AmbientEventRow.test.tsx`): hover triggers popover; expand toggles inline body; muted (filtered out) source doesn't render.
4. Integration test: side-panel mute toggle hides matching rows from `SessionUpdateList` but does NOT change `assembleAcpPrompt` output for the next turn.

---

## Out of scope for 6.a

- Persistent storage of ambient stream (in-memory only).
- Per-session attribution: writes go to the focused session for now.
- Rate-limit / circuit-breaker UI (lives in Phase 6.b — `silvercode doctor ambient`).
- Cross-session ambient history view (one global feed across all panes).
- Inline action affordances on actionable events ("retry CI", "view PR") — that's a future bead once the actionable taxonomy stabilizes.

