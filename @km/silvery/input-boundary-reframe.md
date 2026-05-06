---
mentions:
  - km
id: "@km/silvery/input-boundary-reframe"
aliases:
  - km-silvery.input-boundary-reframe
  - km-silvery-input-boundary-reframe
created_by: claude:c56dc5d6
created_at: 2026-04-24T07:01:23Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.input-boundary-reframe
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-24T00:09:52Z
    created_by: claude:c56dc5d6
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea
---

# [ ] Input boundary reframe — kill the 'two views of one event' smell @km/silvery #epic #P1

blocks:: [[@km/silvery/tea]]

## Input-boundary reframe: kill the "two views of one event" smell

## Problem class

The input pipeline has a recurring bug shape — one event is exposed as TWO concepts, consumers must choose correctly, the wrong choice compiles and passes ASCII tests, breaks on shifted punctuation / non-US layouts / releases / grapheme clusters.

### Symptoms seen in the wild

1. **`input` vs `key.text`** — `input` is a normalized key *name* ("shift+;" → input=";", key.shift=true, key.text=":"). Text-field consumers reaching for `input` silently strip shifted punctuation. Bugs found 2026-04-23: SearchProvider, CommandPalette, useTextArea selection-replace.
2. **`eventType: press|repeat|release` filtering** — `useInput` hides releases; `runtimeInputListeners` doesn't. Handlers written against the runtime layer fire twice per keystroke. The fact that there are TWO listener APIs with different filter semantics is the smell.
3. **Modifier-only keystrokes** — Shift-pressed-alone emits an event with `input=""` + `key.shift=true`. Some consumers handle it, some crash on `input[0]`, some bind chords to it accidentally.
4. **Grapheme clusters / dead keys / IME** — Neither `input` nor `key.text` is a grapheme-cluster primitive. Emoji families, combining marks, and composed characters are second-class.
5. **Paste vs typed text** — `onPaste` is a separate hook but pasted text and typed text are the same concept from a text-field's perspective. Consumers reimplement text insertion logic twice.

## Design goal

**The wrong thing should be hard to express.** A framework reaches quality plateau when the default API leads to correct code — not when docstrings tell you which of two parameters to pick.

## Proposed reframe

### The input boundary has THREE distinct concerns, each deserving its own primitive

| Concern             | What it's for                              | Today                                     | Proposed                                             |
| ------------------- | ------------------------------------------ | ----------------------------------------- | ---------------------------------------------------- |
| Named keys / chords | Keybindings: "ctrl+k", "shift+;", arrows   | useInput w/ input+key.*                   | useHotkey(binding, handler) — declarative only       |
| Text input          | Typed graphemes going into a text field    | useInput w/ key.text ?? input + filtering | useTextInput({ onChar }) — grapheme-cluster per call |
| Raw event stream    | Framework internals (input-routing, tests) | runtimeInputListeners                     | Stays private; never the default import              |

### Core invariants this enforces

- **Chord consumers can't accidentally consume text.** `useHotkey("shift+;", …)` fires on exactly that chord; it receives no grapheme. `useHotkey` exposes no "what was typed" field — the thought doesn't arise.
- **Text consumers can't accidentally consume chords.** `useTextInput({ onChar })` fires once per user-perceived grapheme cluster — whether typed, pasted, bracketed-paste, or IME-composed. It filters releases, modifier-only events, navigation keys, and control characters automatically.
- **No consumer picks between `input` and `key.text`.** The choice doesn't exist in the API.
- **Paste and typed are the same call.** `useTextInput` emits `onChar` for each grapheme regardless of source; pasted-1000-chars → 1000 calls (or a batched `onChars` if measured-perf wins).

## Scope / phases

### Phase 1 — audit and boundary definition

- Grep all `useInput` call sites across silvery + km (examples, apps, tests).
- Classify each: chord, text, release-aware, event-stream.
- Document patterns in `hub/silvery/design/input-boundary.md`.
- Decide the terminal API for `useHotkey` + `useTextInput`. /pro or /csw the shape.

### Phase 2 — ship the three primitives

- `useHotkey(binding, handler, opts?)` — single-binding. `useHotkeyMap({ "ctrl+k": …, "esc": … })` for aggregates.
- `useTextInput({ onChar, onPaste? })` — grapheme-cluster stream. Paste folds into onChar unless a paste-specific path is requested.
- `useRawKeyEvent(handler)` — escape hatch, documented as framework-internal.
- New public entry points. Old `useInput` stays EXPORTED during migration but marked for deletion.

### Phase 3 — migrate every consumer

- ag-react UI components (TextInput, TextArea, SelectList, CommandPalette, SearchProvider, etc.).
- km apps (@km/tui views, @km/logview App, @km/_orphan/cli prompts).
- Examples (silvery examples/**/*).
- Tests — update to new primitives, add grapheme-cluster regression tests.

### Phase 4 — delete `useInput`

- Zero consumers remaining → delete the hook + its filtering logic.
- Update docs: `the-silvery-way.md`, `input-architecture.md`, `styling.md`, every `api/*` reference.
- `SILVERY_STRICT=2` invariant: no `ctx.input(input)` pattern anywhere in source.

### Phase 5 — neighbors

Same "two views of one concept" smell may exist in:

- Mouse coord dual view (cell vs client coords) — audit all mouse handlers.
- ListView `scrollOffset` (item-index) vs `scrollRow` (row-index) — the bug fixed 2026-04-23 was exactly this.
- Size reporting (`term.size` cells vs pixels on supporting terms).

File each as a sibling bead IF the audit finds active bug shapes. Don't preemptively reframe neighbors without evidence.

## Acceptance

- [ ] `grep -rn "ctx.input(input)" vendor/silvery packages apps examples` → 0 hits (pattern gone).
- [ ] `grep -rn "key.text ?? input" vendor/silvery packages apps` → 0 hits (decision moved inside framework).
- [ ] `grep -rn "useInput" vendor/silvery/packages apps examples` → 0 hits, OR only in deprecated-compat barrel tests.
- [ ] New public API: `useHotkey`, `useHotkeyMap`, `useTextInput` all documented with examples + tests.
- [ ] Grapheme-cluster regression tests: emoji-family typing, combining-mark composition, CJK IME, Norwegian æ/ø/å, shifted punctuation across US + international layouts.
- [ ] No "legacy" or "compat" branches remaining.

## Not in scope

- Keyboard protocol enhancement (Kitty flag bits, win32-input-mode) — the new primitives sit above protocol detection.
- Mouse/scroll/size reframes — Phase 5 decides whether to open those as siblings.
- Multi-binding hotkey notation ("ctrl+k ctrl+b" — chorded sequences) — separate bead if wanted.

## Why now

Framework has no users. Every API break costs the same (refactor examples + km, update docs). Later breaks cost users. This is the cheapest moment to reframe, and the bug rate in this boundary is high enough to keep paying for a fix.

