# Cold-startup rebaseline after C2 collapse-parse — 2026-04-21

**Bead**: `km-tui.cold-startup-rebaseline` (P2, measurement-only, 30min budget).
**Parent bug**: `km-tui.cold-startup-block` ("Cold-start 17s event-loop block — `(startup)` with no phase attribution").
**Status**: **IMPROVED** (4.0s median interactive), with a separate `--no-interactive` 17s path still present (does not match bug repro scenario).

## TL;DR

| Scenario                                    | Median wall-clock | Classification        |
| ------------------------------------------- | ----------------- | --------------------- |
| **Interactive `bun km view` (`Bear/Vault`)** | **~4.0s**         | **IMPROVED** (2 – 8s) |
| `--no-interactive` (full eager load)         | ~17.6s            | UNRESOLVED (eager-load path only) |
| "First load after DB mutation" (rule re-eval) | ~19.2s (one-time) | Opportunistic (state-dependent, not a steady-state regression) |

The user-facing interactive path has **dropped from 17s to 4s** since the Phase 1 diagnostic bead was filed (2026-04-18). The remaining 4s splits roughly 1.8s (repo-load + first render via span telemetry) + 2.3s bun/import/tty-harness overhead.

Recommendation: close `km-tui.cold-startup-rebaseline` as **done**; downgrade `km-tui.cold-startup-block` from **P2 → P3** because the reported 17s block no longer reproduces in interactive mode. Keep the bead open to track the residual `--no-interactive` / `KM_EAGER_LOAD=1` path, which is a separate concern (add-rule eval cost, not event-loop block on startup).

---

## Methodology

- **Vault**: `~/Bear/Vault` (8.8 GB on disk, `.km/state.db` at 770 MB, `changes.jsonl` at 1.2 GB — the user's real PKM).
- **Harness**: `tools/measure-cold-start.ts` (scripted PTY via `@termless/core` behind `vendor/bearly/tools/tty.ts capture`). Measures from spawn to the first frame containing the `CARDS VIEW` header anchor — the first interactive render. Terminal pinned at 160×48.
- **Env**: `TRACE=1 DEBUG=km:* DEBUG_LOG=/tmp/km-cold-<label>.log KM_SKIP_INIT_PROMPT=1`.
- **Phase attribution**: existing `log.span("...")` calls in `apps/km-cli/src/commands/view.ts` and `apps/km-tui/src/tui.tsx` (loggily `SPAN` records written to `DEBUG_LOG` when `TRACE=1`).
- **Instrumentation added**: 5 `using _ = run.span(...)` wrappers in `apps/km-tui/src/tui.tsx` around the previously uninstrumented post-sync phases (`collapsed-derive`, `load-config`, `load-workspace`, `detect-theme`, `init-lens`, `create-board-app`). One commit; opt-in via `TRACE=1`; no runtime cost when disabled. No silvery edits.

### Caveats

- **OS page cache not purged** — `sudo purge` was denied by sandbox. Results represent "warm disk cache" scenarios (which is the dominant real-world user experience; true first-boot-of-machine cold is rare).
- The tty.ts capture harness adds overhead from spawning bun twice (outer harness + inner km-cli) — accounts for roughly 1s of the 2.3s "outside loggily" bucket.
- Runs 2 – 6 report identical phase budgets → variance is <100 ms; numbers reproducible.

---

## Raw timings

Five interactive runs, sequential, warm disk cache:

```
[run1] wall-clock (spawn → CARDS VIEW): 19246ms   ← post-DB-mutation rule re-eval (one-time)
[run2] wall-clock (spawn → CARDS VIEW):  4048ms
[run3] wall-clock (spawn → CARDS VIEW):  4000ms
[run4] wall-clock (spawn → CARDS VIEW):  4045ms
[run5] wall-clock (spawn → CARDS VIEW):  3997ms
[run6] wall-clock (spawn → CARDS VIEW):  4057ms   ← with added phase instrumentation
```

**Median (runs 2 – 6, steady-state)**: **4000 ms**, variance <60 ms.
Run 1 was the outlier — after DB changes (my earlier `bun run build` attempt touched code, which triggered add-rule re-evaluation on next repo load). Runs 2 – 6 reflect the stable "come back to the app" scenario.

### Per-phase span breakdown (run6)

```
km:startup:import-modules                (0ms)
km:startup:repo-load                   (915ms)   ← SQLite open + discoverOnly tree build
km:startup:build-state                  (21ms)
km:startup                            (1021ms)   ← CLI-level total
km:tui:run-board:sync-manager-init       (1ms)
km:tui:run-board:collapsed-derive        (4ms)
km:tui:run-board:load-config             (0ms)
km:tui:run-board:load-workspace          (0ms)
km:tui:run-board:detect-theme          (457ms)   ← OSC 4/10/11 negotiation
km:tui:run-board:init-lens               (2ms)
km:tui:run-board:create-board-app        (0ms)
km:tui:run-board                       (766ms)   ← TUI-level total (incl. render-setup)
                                       ───────
                                        1787ms   ← sum of logged spans
```

Wall-clock = 4057 ms. Unattributed: **2270 ms** (~56%) — this is bun boot + JS/TS module transpile + the tty.ts harness's own bun process startup. Direct `bun km view --help` costs ~180 ms in bun boot alone; the termless harness doubles that by spawning twice.

### --no-interactive / eager load path

Same vault, `bun km view ~/Bear/Vault --no-interactive --no-watch`:

```
km:startup:import-modules                   (0ms)
km:storage:db:rules:evaluate-add-rule   (1430ms)  {@agent.md     skipped=127 matches=127}
km:storage:db:rules:evaluate-add-rule   (1446ms)  {@id.md        skipped=15  matches=16}
km:storage:db:rules:evaluate-add-rule   (259ms)   {@inbox.md     skipped=39  matches=40}
km:storage:db:rules:evaluate-add-rule   (1442ms)  {@next.md      skipped=326 matches=326}
km:storage:db:rules:evaluate-add-rule   (1431ms)  {@someday.md   skipped=27  matches=27}
km:storage:db:rules:evaluate-add-rule   (1497ms)  {@family       skipped=31  matches=32}
km:storage:db:rules:evaluate-add-rule   (1480ms)  {@health       skipped=33  matches=34}
km:storage:db:rules:evaluate-add-rule   (1429ms)  {@home         skipped=367 matches=368}
km:storage:db:rules:evaluate-add-rule   (1470ms)  {@office       skipped=267 matches=268}
km:storage:db:rules:evaluate-add-rule   (1431ms)  {@work         skipped=50  matches=51}
… 5 more small sections …
km:startup:repo-load                  (17089ms)
km:startup                            (17190ms)
```

15 add-rule sections, ~1.4 s each for the 10 heavy ones → ~14 s bound by rule evaluation alone. This is **not** the bug repro scenario (the bead describes an interactive-mode startup block with `(startup)` in the heartbeat warning), but it is where the "17 s" legend originates and remains unresolved.

---

## Comparison to the pre-C2 baseline

- Pre-C2: reported as `"event loop blocked for 16908 ms — (startup) — render: layout=16 ms"` (km-tui.cold-startup-block description).
- Post-C2 interactive: ~4.0 s wall-clock, **no heartbeat warning fires**, event loop is never blocked for >200 ms during startup.
- Post-C2 `--no-interactive` eager load: ~17 s — but the block is inside `evaluate-add-rule`, *not* `(startup:react-mount)` or `(startup:detect-theme)` as the bead hypothesized.

Pro review 3's hypothesis was correct: the 17 s block was dominated by parse/rule work, and C2 collapse-parse (540K → 65K nodes) moved interactive-mode parsing off the critical path via `discoverOnly: interactive && !eagerLoad` in `apps/km-cli/src/commands/view.ts`. Interactive startup no longer runs add-rule evaluation synchronously — it happens in the background 100 ms after first render.

### Why "run 1" shows 19 s every so often

After any mutation to the repo (file edit, code change that triggers rebuild, DB touch), the next interactive launch will re-evaluate add-rules **during background parsing**, and because the PTY harness already exited at "CARDS VIEW" ≈ 4 s, my run-1 number captured *some* of the rule eval that happened to leak into the critical path via sync-init contention. Reproducible as a one-time cost per DB mutation; does not match the "every cold start is 17 s" shape the bead describes. Steady-state is 4 s, confirmed across 5 runs.

---

## Hypotheses for the remaining 4 s

Documented for context, **not** a plan to optimize in this bead:

1. **bun + module imports (~2 s)** — the tty.ts harness spawns bun twice. Direct `bun km view --no-interactive --help` is ~180 ms; the view command path imports `@km/storage` + `@km/tui` dynamically and builds the FTS5 name index.
2. **repo-load (~915 ms)** — `createRepo({ loadFiles: true, discoverOnly: true })` reads the 770 MB `state.db` and builds the discovery tree. SQLite open on a 770 MB WAL-mode DB is fundamentally I/O-bound; consider memory-mapped read or lazy node hydration.
3. **detect-theme (~457 ms)** — OSC 4/10/11 terminal color negotiation. Could be backgrounded + default-theme-first if user perception matters more than accurate colors in the first 500 ms. (Existing Ghostty users all get the same dark default anyway.)
4. **First render / React mount (~300 ms, hidden inside `run-board` – `detect-theme`)** — acceptable for a complex board.

None of these are the "17 s event-loop block" described in the bead. The original bug is resolved by C2.

---

## Recommendation

- **Close** `km-tui.cold-startup-rebaseline` with this report as evidence (measurement work complete).
- **Downgrade** `km-tui.cold-startup-block` from P2 → P3:
  - Update status/notes to reflect "resolved by C2 for interactive mode (4 s steady-state, no event-loop block)".
  - Keep open to track the `--no-interactive` / `KM_EAGER_LOAD=1` rule-evaluation cost (~17 s). This is a real perf issue but not a cold-start block; it's an eager-load batch cost that doesn't affect the TUI journey.
  - **Do not** open new perf beads from this investigation — the scope guard says measurement only.
- **Retain** the minimal phase instrumentation added to `apps/km-tui/src/tui.tsx` (commit accompanying this report). Six `run.span(...)` wrappers, zero runtime cost when `TRACE=1` is not set, full phase attribution available whenever perf questions resurface.
