---
aliases:
  - km-silvery.css-aligned-wrap-overflow-terminology
  - km-silvery-css-aligned-wrap-overflow-terminology
created_at: 2026-05-08T21:43:37.047Z
---

# Add CSS-aligned wrap/overflow axes alongside `wrap=` shorthand #task #P3 ^css-aligned-wrap-overflow-terminology

Silvery is a multi-target UI framework with web ambitions (per `docs/silvery-positioning-brief.md`). Today the text-wrap surface uses a single-axis `wrap=` prop with named composites (`wrap`, `truncate`, `truncate-middle`, `clip`, …). The plan is to **add** the underlying CSS-aligned axes (`whiteSpace`, `overflowWrap`, `textOverflow`, etc.) as additional first-class props — **not to replace or deprecate `wrap=`**. Both layers coexist, like CSS `border` shorthand vs `border-width` / `border-style` / `border-color`.

The shorthand stays because it's ergonomic and accurate for 95% of cases. The axes get added because:
- Some compositions don't have a named shorthand (truncate-with-wrap-preference, mixed states under hover/focus).
- Web/canvas targets benefit from speaking the same prop names as the platform.
- Storybook + design docs improve when the underlying axes are visible.

## Current API (shipped, supported, not changing)

The `wrap=` prop on `Text` is a single named-composite axis. Each value bundles `white-space` + `overflow-wrap` + `text-overflow` + `overflow` semantics into one mnemonic.

| `wrap=` (current)   | Behavior                                                                                                                                              | CSS-equivalent axes                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `"wrap"` (default)  | Multi-line word wrap. Word boundaries first, then soft-break separators (`/`, `\`, `.`, `_`, `:`, `,`), then character-wrap fallback.                 | `white-space: normal` + `overflow-wrap: break-word`                                            |
| `"wrap-truncate"` ✨ NEW (a3c32087) | Multi-line word wrap with ellipsis-truncate fallback when atomic-only token exceeds width AND no separator exists.                       | `white-space: normal` + `overflow-wrap: break-word` + `text-overflow: ellipsis`                |
| `"truncate"`        | Single-line. Trims at end with `…` ellipsis when content exceeds available width.                                                                     | `white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis`                         |
| `"truncate-end"`    | Alias of `"truncate"` (explicit "trim at end").                                                                                                       | `white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis`                         |
| `"truncate-start"`  | Single-line. Trims at start with `…` prefix.                                                                                                          | `direction: rtl` + `text-overflow: ellipsis` (named composite)                                 |
| `"truncate-middle"` | Single-line. Trims in the middle (e.g. `path/to/.../file.md`).                                                                                        | (no direct CSS analogue; named composite)                                                      |
| `"clip"`            | Single-line. Hard clips at right edge **without** ellipsis.                                                                                           | `white-space: nowrap` + `overflow: hidden` + `text-overflow: clip`                             |
| `false`             | No wrapping, no clipping. Text overflows its container. Avoid in bordered cells.                                                                      | `white-space: nowrap` + `overflow: visible`                                                    |

Documented in `vendor/silvery/docs/components/Text.md` "Wrap modes" section (commit `b7481cd5`).

## Planned API (additive — `wrap=` stays)

Add the underlying CSS axes as their own props on `Text` (and where applicable, `Box`). All optional; `wrap=` shorthand continues to work and is treated as syntactic sugar for these axes.

| New prop        | Values                                                                       | Default     | Notes                                                                |
| --------------- | ---------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| `whiteSpace`    | `"normal"` \| `"nowrap"` \| `"pre"` \| `"pre-wrap"` \| `"pre-line"`          | `"normal"`  | CSS-canonical                                                        |
| `overflowWrap`  | `"normal"` \| `"break-word"` \| `"anywhere"`                                 | `"normal"`  | CSS-canonical                                                        |
| `wordBreak`     | `"normal"` \| `"break-all"` \| `"keep-all"`                                  | `"normal"`  | CSS-canonical                                                        |
| `textOverflow`  | `"clip"` \| `"ellipsis"`                                                     | `"clip"`    | CSS-canonical                                                        |
| `overflow`      | `"visible"` \| `"hidden"` \| `"clip"`                                        | `"visible"` | Already on `Box`; harmonize on `Text` too                            |

**Resolution**: when both `wrap=` and any axis is set, the explicit axis wins (override semantics). When only `wrap=` is set, it expands internally to the equivalent axes. When only axes are set, they apply directly.

This mirrors how CSS users can write either `border: 1px solid red` or `border-width: 1px; border-style: solid; border-color: red` — both produce the same rendered result; the axes are escape-hatches for combinations the shorthand doesn't cover.

## Acceptance

- [ ] `Text` accepts the five new optional props above; type definitions updated.
- [ ] `Box` already accepts `overflow`; harmonize values to the CSS-canonical set.
- [ ] When `wrap=` is set AND a new axis is set, the axis overrides; document precedence in the API ref.
- [ ] Internal resolver: a single function maps `wrap=` (or its absence) + axis props to the canonical state used by the wrap pipeline.
- [ ] STRICT-mode invariant: contradictory combinations are caught (e.g. `whiteSpace="nowrap"` with `overflowWrap="break-word"`); error explains the conflict and recommends one.
- [ ] `vendor/silvery/docs/components/Text.md` documents the new axes alongside the existing `wrap=` table; cross-references the resolution rule.
- [ ] `vendor/silvery/docs/guide/styling.md` "Wrap and overflow" section authored.
- [ ] Storybook stories: one story per axis showing the value matrix; one combo story showing axis overrides on top of `wrap=`.
- [ ] Cross-target note: same prop names work for the future canvas + DOM targets without remap.
- [ ] `vendor/silvery/CLAUDE.md` mentions the dual-layer model (shorthand + axes) so future agents don't re-introduce ad-hoc names.
- [ ] All existing tests pass at SILVERY_STRICT=2.
- [ ] New tests for axis-override-shorthand precedence + STRICT contradiction-catching.

## Non-goals

- **Deprecating `wrap=`** — it stays as the ergonomic shorthand. Don't emit deprecation warnings; don't plan a removal.
- **Migrating consumer call sites** — if `wrap="truncate"` is the right call, leave it alone. The 145 call sites do not need to be touched as part of this bead. Migration to axes is opt-in per call site, decided by readability.
- Adding `text-overflow: fade` or other non-canonical CSS extensions.
- Changing flexbox or layout primitive names (flexily already uses CSS-aligned terminology).
- Removing `truncate-middle` (no CSS analogue; named composite stays).

## Related

- `@km/silvery/card-content-overflow-clip` (closed at de0f08c4 + 3968462ec) — wrap-at-separators surfaced this design need.
- `@km/silvery/card-body-truncate-ellipsis` (P2) — `wrap-truncate` named composite shipped in silvery `a3c32087` and (when integrated to main) lands the runtime fallback. Independent of this bead.
- `@km/silvery/cell-outside-rect-strict-check` (P3) — sibling STRICT invariant.
- `docs/silvery-positioning-brief.md` — multi-target / web-ambitions / Polaris-aligned reference.
- `vendor/silvery/docs/components/Text.md` — current `wrap=` mapping table (b7481cd5).
- `vendor/silvery/packages/ag/src/types.ts` — `TextProps` interface.
- `vendor/silvery/packages/ag-term/src/unicode.ts` — wrap engine.

## Phased plan

1. **Add axis types to `TextProps`** — typing-only commit; runtime continues to use `wrap=`.
2. **Build the resolver** — `resolveTextWrapPolicy(props): CanonicalWrapState` — single function maps shorthand + axes to the internal state. Tests for precedence.
3. **Wire pipeline to read from canonical state** — measure-phase, render-text, reconciler all consume `CanonicalWrapState`. Existing `wrap=` callers unchanged; new axis callers work.
4. **Docs + storybook** — Text.md updated, styling.md authored, stories added.
5. **STRICT contradiction check** — `bordered-rect-clip` slug or sibling.

No call-site migration phase. The shorthand stays canonical for ergonomic cases; axes are escape-hatches for the rare cases.

## When this bead becomes urgent

- Silvery announces a web/canvas target with a near-term ship date.
- A third independent wrap feature is being added (the cost of one more named mode exceeds adopting axes).
- A consumer reports a wrap composition the shorthand can't express.

Until then, P3 is the right priority — `wrap-truncate` plus the existing modes cover everything we currently need.
