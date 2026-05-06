---
mentions:
  - km
  - claude
id: "@km/silvery/text-box-attr-props"
aliases:
  - km-silvery.text-box-attr-props
  - km-silvery-text-box-attr-props
created_by: claude:c56dc5d6
created_at: 2026-04-23T20:08:21Z
closed_at: 2026-04-23T20:54:44Z
close_reason: >-
  Implemented with 7 commits:

  - 0ca0a8a5 feat(ag): underline: boolean | UnderlineStyleName

  - 00880d74 feat(ag-term): mergeAttrsInRect buffer primitive

  - a35e698a feat(ag-term): render-phase emits mergeAttrsInRect after Box
  children

  - 4a765365 feat(ag-term): per-style underline capability downgrade

  - 7a13b124 fix(ag-term): normalize underline prop in render-text StyleContext
  (caught by contract test)

  - 3f09f016 feat(ag-term): clear prev-frame Box attr overlay on removal (STRICT
  invariant)

  - ef34d926 refactor(ag-react): ListView overscroll uses Box underline


  Tests:

  - vendor/silvery/tests/contracts/attr-props-defaults.contract.test.tsx — 15
  tests

  - vendor/silvery/tests/features/attr-props-overlay.test.tsx — 20 tests

  - Contract + feature: 35 new tests, all pass at SILVERY_STRICT=1

  - All 77 contracts pass, 1593/1600 features pass (7 pre-existing unrelated
  failures)

  - km-tui: 2523/2523 tests pass

  - km-logview: 42/42 tests pass

  - Silvery typecheck: 51 errors (baseline, unchanged)

  - km root typecheck: 56 errors (1 better than 57 baseline)


  All acceptance criteria met:

  ✓ BoxProps + TextProps accept same attr vocabulary (StyleProps already shared)

  ✓ underline: boolean | "single"|"double"|"curly"|"dotted"|"dashed"

  ✓ mergeAttrsInRect op implemented in buffer.ts + used by render phase

  ✓ Output phase emits correct SGR for all 5 styles + CSI 58 underline color

  ✓ TerminalProfile.caps.underlineStyles: readonly UnderlineStyle[] (per-style
  array)

  ✓ Output-phase per-style downgrade (curly on VT100 → plain SGR 4)

  ✓ Contract tests + feature tests per silvery CLAUDE.md (50-row realistic
  scale)

  ✓ km-logview overscroll indicator migrated to transparent Box underline
  overlay
owner: bjorn@stabell.org
assignee: claude:c56dc5d6
---

# [x] Unified attr props on Text AND Box with spelled-out underline styles @km/silvery #feature #P2 @claude:c56dc5d6

## Problem

Silvery has no way to apply SGR attributes (underline, overline, strikethrough, bold/dim/italic) to a region of cells WITHOUT overwriting glyphs/fg/bg. The @km/logview overscroll indicator today uses a \`<Box backgroundColor=\"\$muted\">\` trick — it tints the bg layer but **effectively overwrites the entire line's characters** because silvery Text paths can't distinguish "render char" from "merge attr". User confirmed (2026-04-23): "the current bg tint basically overwrites the entire line."

## Design

Extend BoxProps with the same attr vocabulary Text has — plus spelled-out underline styles.

\`\`\`ts
type UnderlineStyle = \"single\" | \"double\" | \"curly\" | \"dotted\" | \"dashed\"

interface AttrProps {
  underline?: boolean | UnderlineStyle   // true → \"single\"
  underlineColor?: string                 // SGR CSI 58 — separable underline color
  overline?: boolean
  strikethrough?: boolean
  bold?: boolean
  dim?: boolean
  italic?: boolean
}
// Applied to both TextProps and BoxProps (aligned vocabulary)
\`\`\`

### SGR mapping (output phase)

- \`\"single\"\` → CSI 4m
- \`\"double\"\` → CSI 21m (or CSI 4:2m)
- \`\"curly\"\` → CSI 4:3m
- \`\"dotted\"\` → CSI 4:4m
- \`\"dashed\"\` → CSI 4:5m
- underlineColor → CSI 58:2::R:G:Bm (truecolor) or CSI 58:5:Nm (256)
- reset → CSI 24m

### Render-phase primitive

New op: \`mergeAttrsInRect(rect, attrs)\` — OR-combines attr bits into every cell in rect WITHOUT modifying glyphs/fg/bg. Sibling to existing \`setCell(rect, glyph, fg, bg, attrs)\`.

Box with attr props AND no children → emits ONLY the merge op (transparent overlay).
Box with children → children render normally, then merge op runs over the box rect.
Text with attr props → current behavior (attrs baked into its cell writes).
Inheritance: attrs cascade like color does — \`<Box underline><Text>x</Text></Box>\` → x is underlined via the merge op.

### Capability gating

TerminalProfile.caps.underlineStyles: Set<UnderlineStyle>

- Modern terminals (Ghostty, Kitty, WezTerm, iTerm2 recent): all 5
- Legacy / limited: \"single\" only

Output phase downgrades: \`caps.underlineStyles.has(requested) ? requested : \"single\"\`.

### Cross-platform

- Terminal: SGR (above)
- DOM (future): CSS \`text-decoration: underline {wavy|dotted|dashed|double}\` — 1:1 mapping
- Canvas (future): render underline geometry via pixel primitives we already have

The enum keeps the vocabulary platform-neutral — silvery's multi-target ambition (see docs/silvery-positioning-brief.md).

## Tests (per silvery CLAUDE.md — new props require tests)

SILVERY_STRICT=2 tests for every new prop:

- Text: each underline style renders correct SGR
- Box: underline-only Box overlays without touching glyphs
- Box+Text nesting: attrs cascade through children via merge
- Capability downgrade: curly requested on VT100 → falls back to single
- Contract test: defaults (underline omitted = no underline)

## Motivating use cases

1. **Overscroll indicator** (the trigger): \`<Box position=\"absolute\" underline left={0} right={0} top={lastRow} height={1} />\` — add underline on last line without overwriting text
2. **Error squigglies**: \`<Text underline=\"curly\" underlineColor=\"\$fg-error\">typo</Text>\`
3. **Heading underline**: \`<Box underline=\"double\">H1</Box>\`
4. **Hover affordance**: \`<Text underline=\"dotted\">hint</Text>\`
5. **Search match emphasis**: \`<Text underline=\"dashed\">matched</Text>\`

## Acceptance criteria

- [ ] BoxProps extended with AttrProps; TextProps uses same type
- [ ] mergeAttrsInRect op implemented in render phase
- [ ] Output phase emits correct SGR for all 5 underline styles + color
- [ ] TerminalProfile.caps.underlineStyles populated from terminfo/term-def
- [ ] Output-phase downgrade when unsupported
- [ ] Tests in tests/contracts/ + tests/features/ per silvery convention
- [ ] @km/logview overscroll indicator migrated off bg-tint to \`<Box underline />\`

