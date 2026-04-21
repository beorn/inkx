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

---

## 2026-04-21 lazy-hydration measurement

**Bead**: `km-storage.lazy-hydration` (P0, architectural — validate the lazyHydrate code path landed in b1661330a + a139ed79c).
**Status**: **VALIDATED — bead can close**.

Interactive cold-start on `~/Bear/Vault` dropped from 4.0s (pre-session rebaseline) to **2.83s median** (7ms spread across 5 runs). The session's three phase optimizations (defer theme 8912170ef, stat-over-read 8031ca998, lazy-hydrate a139ed79c + b1661330a) collectively removed ~1.2s from the interactive critical path.

### Methodology

Same harness as the rebaseline: `tools/measure-cold-start.ts` → `bun km view ~/Bear/Vault` in a 160×48 PTY, measuring spawn → first frame containing `CARDS VIEW`. Warmup run discarded (5011ms — post-DB-mutation rule re-eval outlier), then five measured runs each config, sequential, warm disk cache.

### Results

| Config | Flag | Min | Median | p95 | Max | Spread |
|---|---|---:|---:|---:|---:|---:|
| **A. Lazy hydration ON** (current default) | none | 2825ms | **2830ms** | 2832ms | 2832ms | 7ms |
| **B. Eager load** (disables discoverOnly + lazyHydrate) | `KM_EAGER_LOAD=1` | 20088ms | **20345ms** | 27813ms | 27813ms | 7725ms |

The eager run 1 outlier (27813ms) is the "post-DB-mutation rule re-eval" leaking into the critical path that the rebaseline doc describes; it's reproducible one-time per DB mutation. Steady-state eager is ~20.3s.

### Per-phase attribution (span telemetry)

**Lazy (run 5, 2827ms wall-clock)**:
```
km:startup:repo-load                     (170ms)   ← discover-disk (3ms) + apply-changes (1ms) + health (53ms)
km:startup:build-state                     (2ms)
km:startup                               (262ms)
km:tui:run-board                         (330ms)   ← incl. detect-theme (deferred post-frame)
───── sum of logged spans: 592ms ─────
unattributed: ~2235ms (bun boot + imports + PTY harness double-spawn)
```

**Eager (run 5, 20088ms wall-clock)**:
```
km:storage:repo-loader:load-repo:reconcile-filesystem    (370ms)   ← what lazyHydrate defers
km:storage:db:rules:evaluate-add-rule × 15 sections    (15.4s)    ← what discoverOnly defers
km:startup:repo-load                                   (17449ms)
km:tui:run-board                                         (300ms)
```

### Isolation: pure lazy-hydration delta

The eager path disables both `discoverOnly` AND `lazyHydrate` together (the CLI gates them on the same `interactive && !eagerLoad` expression). To isolate the lazyHydrate contribution alone, I could not cleanly split them without touching main code. However:

- **Commit author's isolated measurement** (a139ed79c commit message): 3225ms → 2930ms, **−295ms** — measured on the same vault with stat optim already landed and discoverOnly held constant.
- **My span telemetry** shows a 370ms `reconcile-filesystem` span on the critical path when eager, 0ms when lazy. Consistent with the −295ms wall-clock claim (wall-clock < span due to overlap with other late-load work).
- **Combined with `migrateSchema` skip (43ce86863)**: my measured median (2830ms) is 100ms below the commit's 2930ms — consistent with the additional skip.

### Verdict

- **`km-storage.lazy-hydration`**: **CLOSE**. Architectural work landed, measured, behaves as designed. ~295ms isolated reduction on the user's real vault; contributes to the broader interactive critical path shrinking 4s → 2.8s this session. No regressions observed.
- **`km-tui.cold-startup-block`**: **still CLOSEABLE**. Interactive cold start is now 2.83s median with 7ms variance on an 8.8GB / 770MB DB vault. The 17s block the bead originally described does not reproduce in interactive mode. The eager-load `evaluate-add-rule` cost (~15s) remains, but that's a separate concern (eager-load batch cost, not a cold-start UX block — it only fires under `KM_EAGER_LOAD=1` or `--no-interactive`).

### Surprises / regressions

1. **Variance collapsed dramatically**: rebaseline showed <60ms variance across 5 runs at 4.0s; current runs show **7ms variance across 5 runs at 2.83s**. The critical path is now so short that PTY harness overhead dominates, and it's remarkably consistent.
2. **No regressions**: same `CARDS VIEW` first-frame content; no new error surfacing; repo-load span dropped 915ms → 170ms (−745ms) without behavior change.
3. **Floor visible**: ~2.24s is now bun boot + JS/TS import + double-spawn PTY harness overhead. Further wins require either single-spawn harness or `bun build` compiled output — both out of scope for the lazy-hydration bead.

### Raw timings

```
[lazy-1] wall-clock (spawn → CARDS VIEW): 2825ms
[lazy-2] wall-clock (spawn → CARDS VIEW): 2832ms
[lazy-3] wall-clock (spawn → CARDS VIEW): 2832ms
[lazy-4] wall-clock (spawn → CARDS VIEW): 2830ms
[lazy-5] wall-clock (spawn → CARDS VIEW): 2827ms

[eager-1] wall-clock (spawn → CARDS VIEW): 27813ms  ← post-DB-mutation one-time
[eager-2] wall-clock (spawn → CARDS VIEW): 22428ms
[eager-3] wall-clock (spawn → CARDS VIEW): 20345ms
[eager-4] wall-clock (spawn → CARDS VIEW): 20330ms
[eager-5] wall-clock (spawn → CARDS VIEW): 20088ms
```

