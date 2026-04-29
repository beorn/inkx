---
id: "@km/tui/shift-chars"
aliases:
  - km-tui.shift-chars
  - km-tui-shift-chars
created_by: Bjørn Stabell
created_at: 2026-03-31T19:13:54Z
closed_at: 2026-03-31T19:54:53Z
close_reason: "Fixed: key.text field preserves actual typed character before
  normalization. Three insertion points updated to use key.text ?? input:
  readline-ops.ts (new TextInput), old TextInput.tsx, and km-commands
  processKey. Removed !key.meta filter to allow opt+key composed characters."
owner: bjorn@stabell.org
---

# [x] [bug] Shift+key inserts unshifted character in text editor (shift+3 → 3 not #) @km/tui #bug #P2

Shift+key inserts the unshifted base character in text editor. E.g., Shift+3 inserts '3' instead of '#'.

Root cause: silvery's parseKey() normalizes shifted punctuation via SHIFTED_PUNCT_MAP (keys.ts:401-423) — '#' becomes input='3', key.shift=true. This is correct for keybinding matching (shift-3), but the text insert path in key-adapter.ts:148-167 then inserts the base key '3' instead of the original '#'.

Same issue affects opt+key characters: the text insert path at line 153 filters out key.meta, so opt+e (´) is never inserted.

Fix approach: In processKey text insert path, pass the ORIGINAL terminal input (pre-normalization) as the char to insert, not the keybinding-normalized key. This handles shift+punct, opt+key, and IME composition without needing per-layout maps.

Affected: key-adapter.ts:162 — char should be the raw terminal input, not the normalized keyStr.
Also: line 153 (!key.meta) blocks opt+key composed characters.

Files: packages/@km/_orphan/commands/src/key-adapter.ts, vendor/silvery/packages/ag/src/keys.ts