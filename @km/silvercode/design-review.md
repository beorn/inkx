---
id: "@km/silvercode/design-review"
aliases:
  - km-silvercode.design-review
  - km-silvercode-design-review
created_by: claude:cc081a9a
created_at: 2026-04-27T23:59:33Z
closed_at: 2026-04-28T22:18:47Z
close_reason: |-
  Design-review pass complete. Walked all 31 silvercode components via the All/together storybook lens, evaluated against The Silvery Way (vendor/silvery/docs/guide/the-silvery-way.md) + Styling Guide (vendor/silvery/docs/guide/styling.md).

  What reads right: The opencode-style ToolCall row (single line, leading →, kind-coloured verb, no border, no bg) lands cleanly — verb colors map well to ACP ToolKind and the failed-status unification (one card with ✗ glyph + inline error body) reads better than the old envelope-around-row stack. ActivityIndicator's silver-themed verb pool + diamond pulse is delightful and uses semantic tokens correctly. AmbientEventRow's per-source icon + 8-col gutter aligns labels across sources for fast scanning. InlineAskUserQuestionPrompt + InlinePermissionPrompt both delegate Enter handling to <SelectList> — the canonical pattern. UsageMeter's slim progress bar with %-shifting status colors is Polaris-aligned. Welcome's H1/H2/Muted typography presets work.

  What needs iteration: silvercode missed the Sterling consumer migration that km-tui + ag-react received in km-silvery.sterling-consumer-migration. 165+ legacy short-form token sites ($primary/$muted/$accent/$error/$warning/$info/$border/$success/$surfacebg/$mutedbg) live across the components — they currently resolve via silvery 0.20.x's kebab-fallback path but break in 0.21.0. UsageMeter's StructuredQuestion reimplements SelectList where it shouldn't; SessionPromptComposer's QueueDivider works around a real <Divider> feature gap (titleColor); raw <Text bold color=...> shows up in places where a typography preset would be more semantic; AmbientEventRow uses status colors for source identity (not status), which trains users to ignore those tokens; ToolCallError sits as dead-or-zombie code post v2 unification.

  Where the next iteration goes: Land km-silvercode.sterling-token-migration first (P2, mechanical batch-rename) so the rest of the design work doesn't churn legacy tokens. Then the small surgical change beads (toolcallerror-dedup, structured-question-selectlist) can ship in parallel. The silvery-side fix (km-silvery.divider-focused-title) unlocks deleting QueueDivider. Typography-presets and ambient-row-color-hierarchy are taste-and-judgment passes that benefit from a designer eye on the All/together story after Sterling migration settles.

  Filed 8 follow-up change beads under km-silvercode (and 1 under km-silvery for the <Divider> gap):
  - km-silvercode.sterling-token-migration (P2)
  - km-silvercode.structured-question-selectlist (P3)
  - km-silvercode.typography-presets (P3)
  - km-silvercode.toolcallerror-dedup (P3)
  - km-silvercode.ambient-row-color-hierarchy (P3)
  - km-silvercode.bounded-scroll-cap-tuning (P3)
  - km-silvercode.story-section-label-divider (P4)
  - km-silvery.divider-focused-title (P3)

  No code changes under this bead per its design — review beads describe; change beads ship.
started_at: 2026-04-28T22:12:10Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.design-review
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T16:59:41Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Design review pass — tweak every silvercode component via All/together storybook @km/silvercode #task #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

Sit down with the All/together storybook and tweak every silvercode component's design until it reads right end-to-end. The All story is the survey instrument — one representative conversation that shows every surface in one scrollable pane.

## Run

    bun storybook                      # interactive runner
    bun storybook All/together         # jump straight to the All story

Mouse-wheel to scroll. AmbientEventRow rows are click-to-expand.

## Review surface (top → bottom in the story)

- **Welcome banner** — first-launch greeting
- **UserRow / AssistantRow** — conversation prose styling
- **ToolCall** — header (✗/⚙/spinner glyph + title), card border, expand chevron
  - read (completed, with body)
  - execute (completed, with stdout)
  - edit (with diff)
  - failed (✗ glyph + inline error message — verify NO redundant "Error" header)
- **ApplyPatch** — Aider SEARCH/REPLACE rendering
- **AmbientEventRow** — per-source presentation
  - tribe / ci / recall / filewatch / sub-agent / telegram
  - expanded body uses BoundedScroll (max 30 rows)
- **SessionRetry** — retry affordance after failed exchange
- **SubAgentExchange** — Task tool with nested stream
- **SessionExchangeDivider** — hairline between exchanges
- **ActivityIndicator** — thinking spinner
- **RequestPermissionInbox** — pending Bash with Allow/Deny
- **UsageMeter / UsageBreakdown / UsageMetrics** — token bar, breakdown rows, cost+latency chip
- **StructuredQuestion / StructuredAnswer** — mid-turn question card
- **SessionPromptComposer** — bottom-of-screen input

## Recent design changes worth re-validating

- ToolCallStatusTitle now renders the title verbatim (no "Reading…" / "Read 3 files" / "Search failed" verb prefix). Status comes from the leading glyph.
- ToolCall failed-status renders ONE unified card (✗ glyph in header + inline error body). The separate <ToolCallError> envelope is gone from the composed path.
- Disclosure bodies are bounded: BoundedScroll wraps ToolCall expanded body, AmbientEventRow expanded body, SubAgentExchange children, and the "N more lines" Accordion. Cap is 30 rows, kinetic scroll past that.

## Likely tweak areas (judgment calls only the user should make)

- Section spacing / paddings between exchanges
- Color tokens — especially error/accent contrasts
- Glyph choices (✗ vs ⚠, ⚙ vs •, ↳ vs └)
- Typography (Prose / MarkdownView interactions in AssistantRow)
- BoundedScroll cap (30 rows — too tall? too short? per-component override?)
- AmbientEventRow per-source iconography + color coding

## Acceptance

- Walk through every section of All/together
- File follow-up beads for any specific design changes (don't try to land tweaks under this bead — it's the *review* bead, follow-ups are *change* beads)
- Close this bead with a one-paragraph retrospective: what reads right, what doesn't, where the next iteration goes

Bead is intentionally not auto-implementable — the work is design judgment, not code generation.