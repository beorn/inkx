---
id: "@km/silvery/normalize-shifted-punct"
aliases:
  - km-silvery.normalize-shifted-punct
  - km-silvery-normalize-shifted-punct
created_by: claude:f8196c1c
created_at: 2026-03-29T05:02:49Z
closed_at: 2026-03-30T20:01:11Z
close_reason: Already implemented in silvery HEAD. Added 48 tests covering all
  21 US QWERTY shifted punct chars. Normalization in parseKey() works correctly.
---

# [x] silvery: normalize shifted punctuation in legacy input parser @km/silvery #task #P2 @claude:db326126

## Problem

Legacy terminals send shifted punctuation as the result character (e.g., `?` for Shift+`/`, `:` for Shift+`;`) without a shift modifier flag. Kitty protocol sends the base codepoint + shift modifier. This means keybindings registered as `shift-/` don't match on legacy terminals.

## Direction: Normalize in Silvery's parseKey()

Silvery already does this for SGR mouse events — `parseMouseSequence()` in `mouse.ts` extracts modifier bits (shift=bit2, meta=bit3, ctrl=bit4) from the raw SGR button encoding and creates structured events with proper flags. Keyboard input should get the same treatment.

### Where

`vendor/silvery/packages/ag/src/keys.ts`, function `parseKey()` (lines 879-951).

This is the final consolidation point where `ParsedKeypress` → `[input, Key]`. All protocol-specific parsing is done before this. Insert normalization after line 943 (after legacy text extraction, before uppercase letter detection at line 945).

### Precedent: Uppercase Letters Already Normalized

`parseKeypress()` already normalizes uppercase letters for Kitty protocol (lines 801-829): ASCII 65-90 → lowercase name + shift flag. Legacy terminals get uppercase detection at line 945-948 of `parseKey()`. Shifted punctuation is the same pattern, just for non-alpha characters.

### Implementation

Add after line 943 of `parseKey()`:

```typescript
// Legacy terminals: normalize shifted punctuation → base key + shift
// Kitty protocol already provides base codepoint + shift modifier
if (!keypress.kittyProtocol && input.length === 1 && !key.shift) {
  const base = SHIFTED_PUNCT_MAP[input]
  if (base) {
    input = base
    key.shift = true
  }
}
```

Map (US QWERTY — near top of keys.ts):

```typescript
const SHIFTED_PUNCT_MAP: Record<string, string> = {
  ':': ';', '?': '/', '{': '[', '}': ']', '<': ',', '>': '.',
  '@': '2', '#': '3', '!': '1', '$': '4', '%': '5', '^': '6',
  '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=',
  '~': '`', '|': '\\', '"': "'",
}
```

Note: US-keyboard-specific. Non-US layouts would need per-layout maps, but that's a future concern — Kitty protocol handles it natively via `baseLayoutKey`.

## What Changes in km-commands

Once Silvery normalizes at the input layer, km-commands gets simpler:

### 1. Delete keyToString() uppercase normalization (key-adapter.ts:80-83)

```typescript
// DELETE THIS — Silvery now handles it in parseKey()
if (input.length === 1 && input >= 'A' && input <= 'Z') return input.toLowerCase()
```

`keyToString()` becomes a pure special-key mapper (arrows, Enter, Escape, etc.) — no character normalization needed.

### 2. Delete the uncommitted normalizeShiftedPunct() (key-adapter.ts:69-120)

The entire function + SHIFTED_PUNCT_MAP + integration in processKey()/wouldHandleKey() — all unnecessary since Silvery handles it.

### 3. Keybinding comments become unnecessary

Current bindings have comments explaining the mapping:
```typescript
{ key: 'shift-/', commandId: 'show_help' },      // ?
{ key: 'shift-;', commandId: 'command_palette' }, // :
{ key: 'shift-[', commandId: 'nav_back' },        // {
```

These are still useful documentation but the `// ?` comment is now just a mnemonic, not a 'this only works on Kitty' caveat.

### 4. Keybinding-matrix test gets simpler

`vendor/silvery/tests/keybinding-matrix.slow.test.ts` — the `verifyRoundtrip` function has special-case logic for uppercase letters (`isUppercaseLetter`, `isShiftedLetter` at lines 146-154). With Silvery normalizing both letters AND punct, the roundtrip test becomes uniform — all shift keys behave the same way regardless of protocol.

## Verification

- `bun vitest run vendor/silvery/tests/keybinding-matrix.slow.test.ts` — all shift-key roundtrips pass for both legacy and Kitty paths
- `bun vitest run packages/@km/_orphan/commands/tests/` — keybinding resolution still works
- `shift-/` (`?`) dispatches `show_help` on both Ghostty (Kitty) and Terminal.app (legacy)
- `shift-;` (`:`) dispatches `command_palette` on both