---
mentions:
  - km
id: "@km/tribe/reliability-sweep-0415"
aliases:
  - km-tribe.reliability-sweep-0415
  - km-tribe-reliability-sweep-0415
created_by: Bjørn Stabell
created_at: 2026-04-15T07:28:37Z
closed_at: 2026-04-18T18:01:11Z
close_reason: Direct scope complete. Remaining sub-items live as independent
  siblings under km-tribe. Shipped across 2026-04-15 and 2026-04-18 sessions
  (see notes on bead).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.reliability-sweep-0415
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T11:00:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] Tribe + daemon reliability sweep (from 2026-04-15 session) @km/tribe #task #P1

blocks:: [[@km/tribe]]

Tracking bead for the cluster of tribe-daemon reliability improvements discussed in the 2026-04-15 session. Parent bead for individual work items; some have their own beads already (cross-referenced).

## Items in scope

### Memory-pressure false alarms (P1)

The health monitor uses os.freemem() which on macOS only returns truly-free pages, missing the ~50 GB of inactive/compressed memory that is reclaimable on demand. Every time we had 10 GB free + 50 GB reclaimable, the daemon alerted 'memory critical 96%' and triggered secondary effects (Bun allocator panic during km view startup from perceived pressure). Fix: parse vm_stat on Darwin, compute pressure as (active + wired + compressed) / total — matching Activity Monitor semantics. Linux: /proc/meminfo MemAvailable. File: vendor/bearly/tools/lib/tribe/health-monitor-plugin.ts collectOsMetrics().

### Accountly plugin TypeError (P1)

Every ~5 minutes: 'tribe:accountly accountly plugin error: TypeError: undefined is not an object (evaluating status.quotas.filter)'. Plugin is calling .filter on an undefined property. Spams the daemon warnings channel. Fix: null-check or rate-limit. Also: accountly status.quotas is clearly undefined at runtime — plugin state is not being initialized. May need deeper investigation of accountly plugin init.

### Chief auto-election / lease alarms (P2)

See Layer 1/2/3 proposals in the session discussion. Current state: chief lease from @km/_orphan/chief expired 2026-04-03, nothing auto-promoted. 23 unread messages accumulating to 'chief' recipient. Needs:
  Layer 1: health plugin emits chief:expired warning (small)
  Layer 2: daemon auto-promotes longest-running member after 5 min grace (structural fix)
  Layer 3: sendMessage('chief', ...) broadcasts to * when no chief exists (drains dead letters)

### One-time cleanups

- Prune 6 stale 'alive' sessions in the tribe DB with last_message >30 min
- Drain/acknowledge unread queues to dead recipients (chief:23, bench-fixes:9, km-9:10, @km/_orphan/5-ahy:4, etc.)
- GC 6 stale sockets in ~/.local/share/tribe/ (only the current one is live)

### qmd watchdog wrapper (P2)

qmd embed has no dead-hand timer on its embedding API calls; a hang leaves it resident with its batch buffer (10+ GB). Wrap it in vendor/bearly/tools/qmd-watchdog.ts: monitor RSS ceiling, progress timer via stdout tailing, hard wall-clock cap. Restart on pathological behavior.

### Bun allocator panic (P3, upstream)

Segfault at 0x23C923C823C723C6 (classic sequential-byte freed-memory poison pattern) in Bun 1.3.11 during km view startup under memory pressure. Crash report URL in panic output. File upstream at oven-sh/bun. Separate from any km issue — the pressure triggered an existing allocator bug.

### km startup allocates 12 GB RSS on empty vault (P2)

The same panic showed Bun RSS at 12.26 GB during 'Load repo (0/0)' — empty vault, yet multi-GB allocation. Real km memory issue independent of all tribe/qmd problems. Needs its own investigation: what allocates that much during startup with zero files to load?

### Cross-references (existing beads)

- @km/tui/cursor-gate-refactor — cursor writer-side gate (still open, now better understood)
- @km/tui/load-time-invariant-sweep — post-restore invariant heal
- @km/tui/inscope-dialog-migration — held on omnibox settle
- @km/tui/tab-switch-layout-shift — still held, instrumentation plan
- @km/silvery/popover + @km/tui/badge-float-layout — share float primitive

## Acceptance

Each sub-item either ships with its own commit or is promoted to its own bead. This parent bead closes when all P1/P2 items are resolved (sub-beads closed or merged into this one). P3 items (Bun upstream, 12 GB RSS) are tracked but do not block close.

