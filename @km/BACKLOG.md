---
mentions:
  - km
id: "@km/BACKLOG"
aliases:
  - km-BACKLOG
  - "@km/all/BACKLOG"
---

# km Backlog

Phased queue of P0 beads. Position within a phase = priority — move lines to re-rank. Each bead is linked (not transcluded — the link gives you the bead's title + status; click through for full body). The notes underneath are **planning context** — what we need to do, why this order, what's blocking what — not duplicates of the bead description.

For the full backlog including P1+ work: `km bd ready` or `km bd list -s open`.

Updated: 2026-05-06.

---

## Phase 0 — In flight (don't disturb)

Active wip; let the owners finish before queueing more on top.

- [[@km/infra/test-system]]
  - feat/test-system branch: 30 commits ahead of main; integration is the blocker, not feature work. Owner: Bjørn. Action needed: rebase on main, resolve conflicts with the substantive cross-cutting refactors that landed since the branch cut, then merge.
- [[@km/bearly/injection-framing]]
  - wip claude:6552f1e9. Unified `<user_prompt>` envelope across tribe / recall / qmd / hooks / MCP injections. Blocker for ambient pipeline (Phase 4) — must land first.

---

## Phase 1 — Silvercode runtime defense

Stop the status-corruption bug-class that recurred 5× in <2 weeks. Logger first (so the next regression is loud), then the L4 reframe (so the class can't recur).

- [[@km/silvercode/agent-host-l5/02-runtime-kernel-and-turn-owner/session-store-trace]]
  - Phase A: 60-min ship. `setStatus(next, reason, eventKind)` helper + `silvercode:status` debug logger + dev-mode invariant check. Without this, every recurrence is forensics from `ps aux` + `lsof`. Ship BEFORE the L4 reframe so Phase B has evidence its new state machine actually holds.
- [[@km/silvercode/agent-host-l5/02-runtime-kernel-and-turn-owner/queue-stuck-thinking-l4]]
  - Phase B: 1-2 day refactor. Compress 6 states → 4 (`spawning | idle | busy | ended` with `Busy { kind, turnId, since }` payload). Add Turn owner module (mirrors opencode's Runner). `status` becomes derived getter on the public projection, not a stored field. Eliminates the "two writers disagree" bug class entirely.

---

## Phase 2 — Silvery foundation

Architectural pieces under the silvery plateau. Independent — can run in parallel agents.

- [[@km/silvery/focus-ink-parity]]
  - Two parallel focus systems exist (silvery's tree-based FocusManager + Ink-compat shims). Verified `useFocus(options)` already shipped as Ink-compat. Remaining: unify the API surface, kill the duplicate scope/registration paths, document migration. ~1 week.
- [[@km/silvery/custom-protocol-implementation-review]]
  - Audit-shaped, finite scope. Inventory every custom protocol path (Kitty graphics, OSC/DCS/CSI serializers/parsers, capability negotiation, termless adapters); diff vs primary specs; add conformance tests for parser edge cases + escape behavior. Output: a list of follow-up beads for any gaps found. ~3-5 days.
- [[@km/silvery/authoring-elegance]]
  - Framework-adoption bar: minimum-viable plugin in ≤50 LOC, types flow end-to-end, precedence bugs caught at `pipe()`-time. Currently HelpOverlay mini-cutover is ~300 LOC across 4 files. Target API sketched in bead. ~1-2 weeks.

---

## Phase 3 — TEA migration

Silvery's app-architecture backbone. Sequential dependency: `tea-useinput` (P1) unblocker → silvery/tea Phases 2-4 → km-tui/tea cutover.

- [[@km/silvery/tea]]
  - Phase 1 partially shipped (create + pipe packages exist; create-app.tsx still 2,978 LOC monolith). Substrate library shipped; production cutover blocked on `@km/silvery/tea-useinput` (P1) — that's the unblocker. After it lands: Phases 2-4 migrate ag-term/runtime to runEventBatch on the piped chain.
- [[@km/tui/tea]]
  - Domain-plugin migration (withBoard / withSelection / withTree / ...). Downstream of silvery/tea Phase 4 — substrate must be production-cutover before km-tui can adopt. Phase 1 of tui/tea unblocks once silvery's create-app.tsx runs on runEventBatch.

---

## Phase 4 — Silvercode UX completeness

Depends on Phase 0 (injection-framing landed) for the ambient track. The transcript-parity sub-beads can run independently.

- [[@km/silvercode/agent-host-l5/05-context-mentions-and-prompt-composition/ambient-context-excellence]]
  - Re-enable ambient injection in daily flow. Currently disabled because of role-prefix-emission failure (session e8967322, 2026-04-22). Pro review (DeepSeek + Kimi + Gemini) reshaped the plan — add loop-closure layer, per-adapter wire-byte verification, A vs B split-test on Anthropic. Phased child beads ship as each phase starts.
- [[@km/silvercode/claude-code-transcript-parity/canonical-agent-plan-model]]
  - Unify Claude TodoWrite + Codex plan_update + ACP/OpenCode plan updates into one canonical Plan model. Render as collapsible bottom-right drawer above command box (60% prose width), not side panel. ~1 week.
- [[@km/silvercode/claude-code-transcript-parity/chat-turn-projection-refactor]]
  - Make canonical-stream vs derived-UI-envelope explicit. UI "turn" = idle-delimited burst (multiple prompts/messages/activities), NOT "one prompt + response." Foundational for the rest of transcript-parity. ~1-2 weeks.
- [[@km/silvercode/claude-code-transcript-parity/markdown-table-render]]
  - Concrete user-visible: GFM tables render as misaligned monospace today (Claude tool output, bd output). Add column alignment from `:--- / :---: / ---:` separators in MarkdownView. ~1-2 days; depends on `@km/silvercode/text-render-package` (P1) for the shared text-pipeline extraction.

---

## Phase 5 — Plateau closure

The meta closes when the children do.

- [[@km/tui/detail-unify-real]]
  - Currently `[!]` BLOCKED by `@km/silvery/surface-freeze`. Detail view is a parallel rendering path (DetailView 620 LOC + createDetailViewNavigation 90 LOC + viewMode === "detail" branches everywhere). Goal: same lens, same tree, same signals as board. Unblocks when surface-freeze releases (after omnibox + selection plateau close).
- [[@km/all/plateau]]
  - Meta. Closes automatically once the phased plan above completes — this bead is the umbrella, not separate work. Description should be kept in sync with this BACKLOG.

---

## Side track — Single-action decisions

Not phased; pick up when there's a 5-minute gap.

- [[@km/all/shared-substrate-review]]
  - Decision was due 2026-05-05 (overdue). Three deep-dives landed 2026-04-21 (kimmi CRDT, cloudi Gmail-as-truth, km storage RFC). The bead is review-shaped, not implementation. Decide: extract / don't extract / file as future. If extracted, scope the proposal; otherwise close.

---

## Tracking epics (reference)

These don't move through phases — they track the destination. Each has its own internal sequence; the phased plan above is the cross-tracker view.

- [[@km/silvery/architectural-plateau]] — silvery destination meta (view-as-layout-output, TEA, signals, focus/selection unification).
- [[@km/silvery/selection-focus-plateau]] — selection/focus seam-elimination roadmap.
- [[@km/silvercode]] — silvercode app umbrella (P1 — currently the only umbrella across the silvercode P0 work).

---

## Notes on this doc

- **Wave structure** lives inside each tracking epic's description (e.g., `@km/silvery/tea` has Phases 2/3/4 spelled out). This doc orders the trackers; details stay where they're authored.
- **Re-ranking** within a phase: edit the line order.
- **Closing** a bead: just `km bd close`. The link's status indicator updates. Optionally remove the line if it's clutter; the history stays in the bead.
- **`hub/backlog.md`** is the previous-generation backlog (stale; still says "Now: W3 omnibox"). Retire it once this doc has earned trust.

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

- [[@km/silvercode/ambient-context-excellence]]

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

- [[@km/silvercode/session-store-trace]]

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

- [[@km/silvercode/queue-stuck-thinking-l4]]

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

