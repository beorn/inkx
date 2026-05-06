---
mentions:
  - km
  - claude
id: "@km/tui/evaluate-probe-autoprobing"
aliases:
  - km-tui.evaluate-probe-autoprobing
  - km-tui-evaluate-probe-autoprobing
created_by: claude:019d032d
created_at: 2026-04-22T20:08:37Z
closed_at: 2026-04-22T20:20:22Z
close_reason: "Shipped d4db94236 — skip probeColors on theme-cache hit (gated by
  `cacheHit` ref). Saves ~400ms warm startup (18 OSC roundtrips bypassed). 3
  unit tests + live TTY verification. Audit: detectKittyFromStdio already
  short-circuits on capsOption.kittyKeyboard; queryDeviceAttributes +
  queryCursorFromStdio never invoked on the km startup path."
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-tui.evaluate-probe-autoprobing
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-22T13:09:00Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Evaluate dropping stdin auto-probing in km — uses synchronous caps instead, save the latency @km/tui #task #P0 @claude:019d032d

blocks:: [[@km/tui]]

The silvery startup runs four stdin probes synchronously before the TUI takes over: detectKittyFromStdio (kitty keyboard), queryDeviceAttributes (DA1/DA2/version), queryCursorFromStdio (CPR), and probeColors (OSC 4/10/11 palette via deferred-theme-provider's useEffect). Each is a 150-200ms stdio roundtrip, plus probeColors does 18 OSC roundtrips serially. Worst case: ~600-800ms of sequential probing on cold start.

km already has detectTerminalCaps() — the synchronous $TERM/program heuristic — which knows kitty/ghostty/wezterm/foot speak Kitty keyboard, the dark-vs-light polarity, the color level, etc. The recent silvery commit 418bb5ad already short-circuited the kitty stdio probe when caps.kittyKeyboard is true. The same logic applies to the other probes:

- queryDeviceAttributes: only used if we need to know whether the terminal supports specific extensions. With caps already known, mostly redundant.
- queryCursorFromStdio: used by inline-mode height detection. Fullscreen TUI doesn't need it.
- probeColors: 18 OSC palette queries. Used to populate the exact terminal palette. Could fall back to a curated palette per terminal program (we know it's Ghostty/Kitty/etc. from caps) without measurable user impact.

Action items:

1. Audit each probe call site: who calls it, what's the consequence of skipping it, what's the time cost.
2. Decide for each: skip if caps known | run async after first frame | always skip | always run.
3. Update @km/tui's deferred-theme-provider to skip probeColors when a cached theme exists for the (program, polarity) pair. Currently it loads cache then ALSO probes — wasted work.
4. Consider exposing a 'no-probe' option in @silvery/ag-term/runtime that disables all stdin probing entirely.

Why P0: probes contributed to the input-not-consumed bug fixed in silvery 2d9ab59f (probeColors race-condition resetting raw mode mid-flight). Even with the race fix, probes add latency and complexity. Eliminating where unnecessary improves both startup time AND robustness.

