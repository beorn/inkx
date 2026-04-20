# km Roadmap — holistic view

> This doc is the **big-picture** roadmap across all tracks. For the ordered near-term queue, see [`backlog.md`](backlog.md). For the vision informing direction, see [`hub/km/design/vision.md`](../hub/km/design/vision.md).

km is becoming the environment for knowledge work with AI agents. See the [vision doc](../hub/km/design/vision.md) for the three-axis framing (Knowledge / Communication / Agents) that informs this roadmap.

## Five tracks

| Track | Scope | Horizon | Owner epic |
|---|---|---|---|
| **1. km TUI** | Interactive workspace, views, editing, omnibox, selection | 1-3 months | `km-tui` |
| **2. Silvery maturation** | TUI framework: v0.5 → v1.0 → v2.0 (canvas) | 6-12 months | `km-silvery` |
| **3. Knowledge layer** | km bd, recall, brain/ENGRAM, connectors, facets | ongoing | `km-infra`, `km-all` |
| **4. Communication (tribe-matrix)** | Matrix-based live wire for agent coordination | 2-3 weeks once started | `km-tribe` |
| **5. Ecosystem** | Silvery marketing, terminfo.dev, bearly tools, vorg | parallel | `km-market`, `km-terminfo`, `km-bearly` |

Each track has its own chain of beads; see each epic for the phased detail.

## Near-term sequencing (option P2 — moderate reframe weave)

The chosen near-term sequencing threads tribe-matrix into the existing W3-W7 workstream order rather than pausing them (P1) or front-loading the reframe (P3). Gains Matrix live-wire work without starving current momentum.

### Now

1. **W3 — Omnibox v1 finish** (`km-tui.omnibox-dialog`, in-progress). Phases 2-5 of omnibox. Ship gate.

### Queued (in order)

2. **`km-infra.bd-v1-compat`** — write-path persistence for `km bd`. Durable work ledger as km-native. In-progress.
3. **`km-infra.namespaces` (small spike)** — generalize short-ID minting via the namespace facet. ~2-3 days. (Design complete; execute when short-id prominence first matters.)
4. **`tribe-matrix` Phase 0** — `@bearly/room` interface + memory + file adapters + chaos conformance tests. 5-6 days. See [`hub/km/design/tribe-matrix.md`](../hub/km/design/tribe-matrix.md).
5. **`tribe-matrix` Phase 1** — Matrix adapter + homeserver install flow. 4-5 days.
6. **W4 — TEA in silvery + aichat showcase** (`km-silvery.tea`). Silvery 0.18.0 lockstep release.
7. **`tribe-matrix` Phase 2** — personas + session assumption + lease mechanism. 3-5 days. Runs alongside W4/W5 as feasible.
8. **W5 — Theme system + aichat polish** (`km-silvery.theme-mature`).
9. **W6 — TEA in km + polish** (`km-tui.tea`).
10. **`tribe-matrix` Phase 3** — silvery channel view + `km-tui.backlog-view`. Part of the silvery work.
11. **W7 — Selection system** (`km-all.unified-selection`).
12. **`tribe-matrix` Phase 4** — structured events + bead threading.

### Parallel (unblocked work, pick up between phases)

- `km-tui.omnibox-quality-plateau` — legacy-dialog deletion (in-flight).
- `km-silvery.selection-focus-plateau` — focus-scope plateau.
- `km-tui.cold-startup-block` — perf bug investigation.
- `km-storage.vault-node-explosion` — 549K node investigation.

### Future (committed direction, not scheduled)

- **Silvery v1.0 stability contract** — see [`hub/silvery/horizons.md`](../hub/silvery/horizons.md).
- **Silvery v2.0 canvas** — `km-silvery.ag-canvas`.
- **Cross-framework reconcilers** — ag-solid, ag-vue, ag-svelte (`km-silvery.opentui-parity`).
- **`km-infra.facet-system`** — formalize facets once 2-3 concrete types (task, room, persona) are established.
- **Universal editor** — `km-all.universal-editor`, needs runly/docily/textily/termily packages.
- **Brain / ENGRAM** — `docs/future/brain.md`; active design.
- **Connectors expansion** — GitHub, Linear, Slack (CalDAV/CardDAV already shipped).
- **Virtual Org** — `km-all.vorg`.
- **tribe-matrix Phase 5+** — E2E encryption, OpenClaw bridge, Matrix federation for multi-human collaboration.

## Track detail

### Track 1 — km TUI

Active: W3 omnibox finish. Next: TEA integration (W4/W6), theme upgrade (W5), unified selection (W7). Views expand with backlog-view (`km-tui.backlog-view`) and channel-view (tribe-matrix Phase 3, silvery work). Plus bug fixes and perf (cold-startup-block, vault-node-explosion, column-top-disappears).

### Track 2 — Silvery

v0.5 (composable layout engine) near-shipped. v1.0 stability contract is the public-release target. v1.5 TEA lands in `km-silvery.tea`. v2.0 canvas path prototyped (`km-silvery.ag-canvas`). v3.0 scene-ready (`km-silvery.ag-scene-ready`). Parallel: altInline, opentui-parity gaps, cross-framework reconcilers.

### Track 3 — Knowledge layer

Already shipped: CalDAV/CardDAV connectors, `@km/agent` + `km agent` CLI, `km bd` (read path). In progress: bd write path (`km-infra.bd-v1-compat`), vault-node-explosion investigation. Planned: facet system formalization (`km-infra.facet-system`), namespaces (`km-infra.namespaces`), brain/ENGRAM integration, more connectors (GitHub/Linear/Slack).

### Track 4 — Communication (tribe-matrix)

Design captured in [`hub/km/design/tribe-matrix.md`](../hub/km/design/tribe-matrix.md). Five phases; Phase 0 is the Room-interface validation on minimal adapters (memory + file + chaos tests); Phase 1 brings Matrix + homeserver; Phase 2 adds personas + lease; Phase 3 is km-tui channel view; Phase 4 structured events + bead threading. Phase 5+ (E2E, OpenClaw, federation) deferred.

Retiring: old `@bearly/tribe` daemon (8300 LOC custom wire) after Phase 2. Related beads dissolved under the adapter+persona+lease model (`km-tribe.stable-identity`, `km-tribe.daemon-authority`, `km-tribe.scope-model`, `km-tribe.role-register-cleanup`, `km-tribe.plugin-boundary-tightening`, `km-tribe.polish-v2`).

### Track 5 — Ecosystem / side products

`km-market` covers silvery marketing, SEO, positioning. `km-terminfo` runs terminfo.dev as a side-product. `km-bearly` is the `@bearly/*` tool monorepo (tribe, recall, llm, refactor, tty). `km-all.vorg` is the Virtual Org skill framework. These proceed in parallel with the main four tracks; no hard coupling.

## Cross-cutting policies

- **`km-all.surface-freeze`** — no new view modes, no new node types during W1-W7. Lifts when W3 ships AND W7 closes. Facet system respects this — formalize AFTER W7.
- **Bug rule**: fix inline if scoped (<1h); otherwise bead and schedule.
- **No P-values on new beads** — ordering is position in [`backlog.md`](backlog.md).
- **Short IDs** — once `km-infra.namespaces` lands, new beads can use area-scoped IDs (`TUI-47` etc.). Existing `km-xxxx` IDs stay valid.

## Budget in calendar weeks

Rough estimate for the P2 sequencing, assuming ~40h/week focused work:

| Item | Duration |
|---|---|
| W3 omnibox finish | 2-3 weeks (in-progress) |
| bd-v1-compat write path | 1 week |
| namespaces spike | 2-3 days |
| tribe-matrix Phase 0 | 5-6 days |
| tribe-matrix Phase 1 | 4-5 days |
| W4 silvery TEA | 2-3 weeks |
| tribe-matrix Phase 2 | 3-5 days |
| W5 theme + polish | 1-2 weeks |
| W6 TEA in km | 1-2 weeks |
| tribe-matrix Phase 3 (alongside silvery view) | 1-2 weeks |
| W7 selection system | 2 weeks |
| tribe-matrix Phase 4 | 1 week |

Total: ~4-6 months of sustained focused work to land everything through W7 + tribe-matrix Phase 4.

## How to use this doc

- **New task?** Find the right track and epic; check whether the work belongs in the Queued section of [`backlog.md`](backlog.md) or in the Future list here.
- **Vision question?** Jump to [`hub/km/design/vision.md`](../hub/km/design/vision.md).
- **Implementation detail for tribe?** See [`hub/km/design/tribe-matrix.md`](../hub/km/design/tribe-matrix.md).
- **Silvery horizons detail?** See [`hub/silvery/horizons.md`](../hub/silvery/horizons.md).
- **What's next?** Top of [`backlog.md`](backlog.md) Now section.

This doc is the map. Update when a track shifts materially; don't track every bead here.
