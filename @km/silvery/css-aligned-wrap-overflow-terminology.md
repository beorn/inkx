---
aliases:
  - km-silvery.css-aligned-wrap-overflow-terminology
  - km-silvery-css-aligned-wrap-overflow-terminology
created_at: 2026-05-08T21:43:37.047Z
---

# Adopt CSS-aligned wrap/overflow terminology in silvery + clean up consumer call sites #task #P0

Silvery is a multi-target UI framework with web ambitions (per `docs/silvery-positioning-brief.md`). Today the text-wrap surface uses ad-hoc terminology (`wrap`, `truncate`, `truncate-middle`, `clip`) that doesn't compose, doesn't map cleanly to CSS, and forces consumers to learn silvery-specific vocabulary. With the imminent landing of `@km/silvery/card-body-truncate-ellipsis` (wrap-then-truncate fallback), the surface needs a clean redesign before more cruft accretes.

This bead drives the redesign and the cleanup of all 145 consumer call sites.

## Why P0

- Silvery's web/canvas targets are explicit roadmap items. CSS-aligned semantics are foundation work — every divergence we ship now becomes a back-compat shim later.
- The next wrap feature (`card-body-truncate-ellipsis`) needs a place to land. Adding `wrap="wrap-or-truncate"` would compound the mess; CSS gives us composable axes (`overflow-wrap` × `text-overflow`).
- 145 call sites in `apps/` and `vendor/silvery/packages/ag-react/src/` use the legacy API. Each new feature multiplies the migration cost.

## Goal

Replace silvery's single-axis `wrap` prop with the canonical CSS axes:

| CSS axis           | Values                                       | Meaning                                                      |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------ |
| `whiteSpace`       | `normal` (default), `nowrap`, `pre`, `pre-wrap`, `pre-line` | Whether whitespace collapses, whether content wraps at all   |
| `overflowWrap`     | `normal` (default), `break-word`, `anywhere` | What to do when a token is wider than its container          |
| `wordBreak`        | `normal` (default), `break-all`, `keep-all`  | Break-point preference within a token                        |
| `textOverflow`     | `clip` (default), `ellipsis`                 | What to render when content overflows after wrapping         |
| `overflow`         | `visible` (default), `hidden`, `clip`        | Whether overflow is rendered or trimmed at the box           |

The current `wrap=` and `overflow=` props become **named composites** of the CSS axes (kept as syntactic sugar, mapped to the canonical state):

| Legacy `wrap=` | CSS-canonical equivalent                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| `wrap` (default) | `whiteSpace="normal"` `overflowWrap="break-word"` `textOverflow="clip"`                 |
| `truncate`     | `whiteSpace="nowrap"` `overflow="hidden"` `textOverflow="ellipsis"`                       |
| `truncate-middle` | (named composite — keep as primitive; CSS doesn't have `middle` natively)              |
| `clip`         | `whiteSpace="nowrap"` `overflow="hidden"` `textOverflow="clip"`                           |
| (NEW) `wrap-or-truncate` | `whiteSpace="normal"` `overflowWrap="break-word"` `textOverflow="ellipsis"`     |

Soft-break separator support (the just-shipped `/`, `\`, `.`, `_`, `:`, `,`) becomes a property of `overflowWrap="break-word"` — break at separators preferred over mid-character breaks. `overflowWrap="anywhere"` remains for true mid-character breaks (CSS-aligned).

## Acceptance

- [ ] Silvery `Text` component accepts the new CSS-aligned props: `whiteSpace`, `overflowWrap`, `wordBreak`, `textOverflow`, `overflow`.
- [ ] Silvery `Box` component accepts `overflow` (already partially supported — make CSS-canonical).
- [ ] Legacy `wrap="…"` continues to work for one minor version, mapped to the new axes via internal compatibility layer; emit a deprecation warning in dev mode.
- [ ] All 145 consumer call sites in `apps/km-tui/`, `apps/silvercode/`, `apps/km-cli/`, `vendor/silvery/packages/ag-react/src/`, `vendor/silvery/storybook/`, and `vendor/silvery/tests/` migrate to the CSS-aligned API.
- [ ] Remove the deprecation shim after the migration commit; legacy `wrap=` errors at the type level.
- [ ] Storybook stories demonstrate every CSS axis combination + the `wrap-or-truncate` named composite.
- [ ] Documentation in `vendor/silvery/docs/guide/styling.md` and the API ref pages adopt CSS terminology, with a "migration from legacy wrap=" section.
- [ ] `vendor/silvery/CLAUDE.md` and the design tokens index list the canonical props.
- [ ] STRICT-mode invariant: render pipeline asserts that consumer didn't pass conflicting axes (e.g. `whiteSpace="nowrap"` with `overflowWrap="break-word"` is a contradiction; pick one).
- [ ] Cross-target compatibility note: same prop names work for the future canvas + DOM targets without remap.
- [ ] km-tui `<CardBody>` (or equivalent) uses `whiteSpace="normal"` + `overflowWrap="break-word"` + `textOverflow="ellipsis"` — the canonical wrap-then-truncate composite.
- [ ] Pre-existing `wrap="truncate"` users in CardColumn (`apps/km-tui/src/views/CardColumn.tsx:504`, `:611`, `:710`, `:801`) port to either named composite or explicit axes.
- [ ] All existing tests pass at SILVERY_STRICT=2.
- [ ] New property/fuzz tests for the CSS axes interaction matrix.

## Non-goals

- Removing `truncate-middle` (no clean CSS analogue; keep as named composite).
- Implementing CSS `text-overflow: fade` or other non-canonical extensions.
- Changing flexbox or layout primitive names — those are separate (flexily already uses CSS-aligned terminology).

## Related

- `@km/silvery/card-content-overflow-clip` (closed at de0f08c4 + 3968462ec) — the bug that surfaced this need.
- `@km/silvery/card-body-truncate-ellipsis` (P2) — the next wrap feature; should land on the new API, not the legacy one.
- `@km/silvery/cell-outside-rect-strict-check` (P3) — STRICT invariant; sibling work.
- `docs/silvery-positioning-brief.md` — canonical "silvery is multi-target / web-ambitions / Polaris-aligned" reference.
- `vendor/silvery/docs/guide/styling.md` — current styling docs to update.
- `vendor/silvery/packages/ag-react/src/components/Text.tsx` — the surface to extend.
- `vendor/silvery/packages/ag-term/src/unicode.ts` — the wrap/truncate engine that already implements the underlying behaviors.

## Migration plan (phased)

1. **Land new props, keep legacy** (1 commit) — extend Text/Box typing; map legacy `wrap=` internally; tests for both APIs pass.
2. **Migrate vendor/silvery internals** (1 commit) — silvery's own components and storybook stories use CSS-aligned API.
3. **Migrate apps** (1-3 commits, one per app: km-tui, silvercode, km-cli) — apps adopt new API; km-tui adds `<CardBody>` if appropriate.
4. **Land `wrap-or-truncate` named composite + the truncate-fallback fix** — closes `@km/silvery/card-body-truncate-ellipsis`.
5. **Remove legacy shim + type-level error** (1 commit) — deprecation period ends; `wrap=` is no longer valid.
6. **Docs sweep** (1 commit) — styling.md, the-silvery-way.md, all examples updated.

Each phase ships independently. Phases 1-4 land before any new wrap features; phases 5-6 conclude the migration.

## Boil-the-ocean reach (clean as possible, per user)

- [ ] Audit every styling prop on Text/Box for CSS alignment beyond just wrap/overflow: `align`, `justify`, `padding`, `margin`, `gap`, `flexDirection`, `flexWrap`, `flexGrow`, `flexShrink`, `flexBasis`, `position`, `top/right/bottom/left` — flag any that diverge from CSS for a follow-up bead.
- [ ] Audit color props for CSS alignment (`color`, `backgroundColor`, `borderColor` — these match; check edge cases like `selectionColor`, `cursorColor`).
- [ ] Type-system cleanup: every CSS-aligned prop accepts the union of canonical CSS values (autocomplete works in IDE).
- [ ] Storybook coverage matrix: show all axes × all named composites × all common content types (short word, long path, multi-line, mixed).
- [ ] `silverize/` skill audit pass — flag any code using legacy terminology after migration.
- [ ] Update memory: add a feedback entry "silvery adopts CSS terminology; new components accept canonical CSS-aligned props" so future agents don't re-introduce ad-hoc names.
