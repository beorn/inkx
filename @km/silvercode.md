---
mentions:
  - km
id: "@km/silvercode"
aliases:
  - km-silvercode
  - "@km/_orphan/silvercode"
created_by: claude:208595de
created_at: 2026-04-24T09:00:35Z
---

# [ ] [epic] Silvercode — silvery-native agent workspace @km/silvercode #feature #P1

blocks:: [[@km/silvercode/code]]

- [/] claude-acp newSession synthetic fallback id is a phantom-session footgun #bug #2 @issue priority:: 2

  SESSION_INIT_TIMEOUT_MS=10_000 in apps/silvercode/packages/claude-acp/src/server.ts:244 falls back to a synthetic id claude-acp-${Date.now()}-${sessions.size + 1} when claude's session-init doesn't arrive within 10s.

  Symptom (recurrence 2026-04-28 22:10 PT, session claude-acp-1777439414160-1): cold-boot Claude on silvercode launch + MCP children took >10s to emit session-init. The Promise resolved with the synthetic id; attachWire bound to the synthetic id; the late real session-init was replayed but tagged with the fallback id. Result:
  - ACP session id no longer matches any `~/.claude/projects/<cwd>/<UUID>.jsonl` file
  - `loadSession({sessionId})` for resume fails with "session not found"
  - The session APPEARS to work (events flow) but is silently broken for resume / transcript lookup

  Fixes (pick one):
  - (a) Drop the timeout entirely — wait on the real event, surface a separate error if claude exits without emitting session-init.
  - (b) Surface init failure as a `newSession` error instead of resolving with a phantom id. UI shows "claude failed to initialize" instead of a broken session card.
  - (c) Extend timeout to 30s + add boot-state phase to the wire (UI shows "starting…" instead of accepting input). Cold boot on M-series with MCP children regularly takes 5-15s.

  Recommend (b) — fail loud rather than synthesize. A failed newSession is recoverable (user spawns a new one); a phantom session is not (user types into a black hole).

  Test: termless test that simulates a 12s session-init delay; assert newSession either rejects or extends its wait, never resolves with a synthetic id.

  Related to but separate from @km/silvercode/queue-stuck-thinking-l4 — that bead's Phase B (Turn module) would also own session-init readiness, at which point this bead may collapse into it. For now, ship as a narrower, faster fix.
- [x] Welcome screen bypassed by PaneGrid '◈ Spawning session…' chrome on fresh silvercode launch #bug #P2 @issue priority:: P2

  Symptom: when user runs silvercode (no --resume), the Welcome screen does NOT render on first paint. Instead, PaneGrid shows a chrome-level placeholder reading ◈ Spawning session… and the banner + command box never appear until something else flips the state.

  Source: apps/silvercode/src/components/PaneGrid.tsx:429
  <Text color="$muted">◈ Spawning session…</Text>

  Looks like PaneGrid renders this placeholder when no SessionCard has materialized yet — i.e., during the window between silvercode launch and the first session.spawn() rendering its card. SessionCard's messages.length === 0 branch correctly shows Welcome, but if PaneGrid never gets to render SessionCard (because the session handle isn't bound yet), the user sees the chrome placeholder instead.

  Expected: from the moment silvercode starts, the user sees:
  - ◈ accent
  - Big SILVER ASCII art (figlet Big tier on wide terminals)
  - Big CODE ASCII art
  - agent label (muted)
  - centered command box (TextInput, even if isActive=false placeholder)
  - (no command keybinding help — per definitive spec)

  Reported by beorn on 2026-04-29 morning. Postponed until after the current consolidation drain + everyone-in-worktrees cutover. Fix should be done in a fresh worktree post-cutover.

  Likely fix sketch:
  - Either: SessionCard renders Welcome immediately when handle is created (don't gate on internal store readiness)
  - Or: PaneGrid's placeholder branch renders the Welcome banner directly instead of plain "◈ Spawning session…" text
  - Or: have controller.spawnSession() create the SessionHandle synchronously (with status='spawning') so PaneGrid has a card to render right away

  Related beads:
  - km-cr94 (silvercode UI iter2 — the Welcome restructure that landed today)
  - km-silvercode.queue-stuck-thinking-l4 (concurrent — the Turn-owner reframe)
  - km-silvercode.session-store-trace (concurrent — Phase A logger; once shipped, this bug will leave a status trace at first paint)

Internal codename for the agent workspace product wrapping Claude Code (and later other agents) with silvery-native UI. See hub/silvery/future/ai-terminal/00-agent-workspace.md for the full spec. Differentiators: subscription-legal subprocess spawn, bidirectional stream-json, auto-injected km/tribe memory, knowledge-ref popovers (beads, files, URLs), multi-session permission inbox, replay + search, multi-account support (post-MVP). Two-track integration: Track 1 (subprocess, subscription) default; Track 2 (SDK, API key) for power users. NOT a shell, NOT a tmux, NOT a public protocol. Phased M0–M12 (~13 weeks to MVP). Keep INTERNAL — do not publish on public silvery site.

- [x] silvercode: scroll wheel surfaces shell scrollback instead of staying inside alt-screen #P2 @issue priority:: P2

