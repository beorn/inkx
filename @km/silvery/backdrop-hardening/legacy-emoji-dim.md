---
id: "@km/silvery/backdrop-hardening/legacy-emoji-dim"
aliases:
  - km-silvery.backdrop-hardening.legacy-emoji-dim
  - km-silvery-backdrop-hardening-legacy-emoji-dim
created_by: claude:88c0e764
created_at: 2026-04-20T21:00:07Z
closed_at: 2026-04-20T21:24:49Z
close_reason: "Legacy fadeCell branch (scrim===null) now stamps attrs.dim on
  emoji lead+continuation when fgHex && bgHex. CJK skipped. 3 new tests cover:
  emoji with theme bg, emoji with null bg fallback, CJK does NOT get dim. 92→95
  backdrop tests pass. Commit d02e7604."
owner: bjorn@stabell.org
assignee: claude:a1a0e667
dependencies:
  - issue_id: km-silvery.backdrop-hardening.legacy-emoji-dim
    depends_on_id: km-silvery.backdrop-hardening
    type: parent-child
    created_at: 2026-04-20T14:01:07Z
    created_by: claude:88c0e764
    metadata: "{}"
---

# [x] Legacy no-scrim path doesn't fade emoji when Kitty unavailable @km/silvery #bug #P0 @claude:a1a0e667

blocks:: [[@km/silvery/backdrop-hardening]]

Pro review P1.4. In realize-buffer.ts scrim === null branch, emoji cells with resolvable fg+bg mix fg only. Emoji glyphs typically ignore fg. So in a tree without ThemeProvider (no defaultBg) on a non-Kitty terminal, emoji in a faded region stay crisp despite docs promising they'd be dimmed.

## Fix

In legacy branch when isEmojiGlyph:
- Stamp attrs.dim on lead cell
- Propagate dim to continuation cell(s)

## /complete criteria

- [ ] Failing test: <Backdrop fade={0.4}>emoji in region</Backdrop> without ThemeProvider, Kitty disabled → lead has attrs.dim, continuation has attrs.dim
- [ ] All 8 perceptual invariant tests still green
- [ ] All 5 Kitty overlay tests still green

## Parent

@km/silvery/backdrop-hardening