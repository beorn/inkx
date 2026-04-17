# OpenTUI ↔ opencode — competitive research

_Captured 2026-04-15. Snapshot of an in-motion competitor; re-verify before quoting numbers._

## TL;DR

OpenTUI and opencode are **built by the same team** (anomalyco / "Anomaly", ex-SST). OpenTUI is not a third-party dependency opencode happened to pick up — it is a purpose-built replacement for opencode's old Go/Bubble Tea TUI, written by the same people, with opencode as its showcase application. This is the exact model silvery + km follows. The difference is they shipped first, they're on React _and_ Solid, and their core is native Zig.

## Relationship

- **Common org**: both repos live under `github.com/anomalyco` (formerly `sst/opencode`; the sst URL now 301-redirects to `anomalyco/opencode`). "Anomaly" is the company behind it — `anoma.ly`, tagline "For whatever you build."
- **Overlapping maintainers**: `@opentui/core` on npm lists maintainers `kommander`, `fanjie`, `thdxr`. `thdxr` is Dax Raad, co-founder of SST and a known face of opencode.
- **Timeline**
  - `anomalyco/opentui` repo created **2025-07-21**.
  - opencode's `STATS.md` shows downloads starting **2025-06-29** — at that point its TUI was Go/Bubble Tea.
  - Current `packages/opencode/src/cli/cmd/tui/` is pure TypeScript against `@opentui/solid` + `@opentui/core` (version `0.1.99`). No Go files remain in the repo.
  - Conclusion: OpenTUI was spun up ~a month after opencode's public take-off, explicitly to replace the Bubble Tea TUI with an in-house framework they control.
- **Scale today** (2026-04-15)
  - `anomalyco/opencode`: **~143.8k stars**, primary language TypeScript, monorepo ~297k TS/TSX LOC.
  - `anomalyco/opentui`: **~10.4k stars**, description "OpenTUI is a library for building terminal user interfaces (TUIs)".
- **Positioning**: OpenTUI the library pulls ~7% of opencode's star traffic. It's _independently useful_ but clearly rides on the opencode halo — same playbook as "silvery is general-purpose, km is its showcase."

## What OpenTUI actually is

- **Core**: `@opentui/core` — a TypeScript façade over a **native Zig core**, shipped as per-platform prebuilt binaries (`@opentui/core-darwin-arm64`, `-darwin-x64`, `-linux-arm64`, `-linux-x64`, `-win32-arm64`, `-win32-x64`). Rendering, layout (flexbox), and diffing hot paths live in Zig. TypeScript drives imperative `*Renderable` handles (`BoxRenderable`, `ScrollBoxRenderable`, `TextareaRenderable`, `InputRenderable`, `RGBA`, `MouseEvent`, `MacOSScrollAccel`, etc.).
- **Framework reconcilers (first-party)**
  - `@opentui/solid` — SolidJS renderer. What opencode uses.
  - `@opentui/react` — React renderer for the same core.
- **Community surface**: `@opentui-ui/dialog`, `@opentui-ui/toast`, `opentui-spinner`, multiple forks (`@fairyhunter13/*`, `@vybestack/*`, `@phantasy/*` with kitty/iTerm2 image rendering).
- **Not in evidence**: a headless testing harness, STRICT-style invariants, replay-vs-incremental cross-check, snapshot framework. From the opencode TUI code paths it looks like they render to real terminals and test visually. This is silvery's biggest moat.

## How opencode uses it

- All of `packages/opencode/src/cli/cmd/tui/` (~18.3k LOC of `.tsx`) is SolidJS + OpenTUI.
- App wiring in `app.tsx`: `render` + `useKeyboard` + `useRenderer` + `useTerminalDimensions` + `Portal` from `@opentui/solid`; `createCliRenderer`, `MouseButton` etc. from `@opentui/core`.
- Own context providers (`RouteProvider`, `SDKProvider`, `SyncProvider`, `ProjectProvider`, `DialogProvider`) and their own dialog/list/command component suite under `@tui/component/*` and `@tui/ui/*`. OpenTUI gives them primitives, not a component library; opencode rolls its own canonical components on top.
- State is split between Solid signals and their own event bus / SDK sync layer — no single Elm-style state machine like km's `@silvery/tea`.

## OpenTUI vs silvery — head to head

| Axis                  | OpenTUI                                                                        | silvery                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Core language         | TypeScript façade over **native Zig** (prebuilt per-platform `.node` binaries) | Pure TypeScript, own reconciler + `ag-term` pipeline + Flexily layout                                                       |
| Framework host        | `@opentui/solid` + `@opentui/react` (multiple first-party renderers)           | `@silvery/ag-react` only (React 19)                                                                                         |
| Layout engine         | Flexbox inside the Zig core                                                    | Flexily — Yoga-compatible flexbox in TS with fingerprint cache                                                              |
| Component model       | Imperative `*Renderable` handles that the reconciler mutates                   | Declarative JSX (`<Box>`, `<SelectList>`, `<TextInput>`, `<ListView>`) all the way down                                     |
| Theming               | App-level RGBA, per-component                                                  | Semantic tokens (`$primary`, `$muted`), typography presets                                                                  |
| State model           | Solid signals / opencode's own bus + SDK sync                                  | `@silvery/tea` (Zustand) + km's `@km/commands` state machines, `(action, state) → [state, effects]`                         |
| Testing story         | None visible — renders to real terminals                                       | **termless** headless terminal, snapshot + invariant assertions, `SILVERY_STRICT`, replay-vs-incremental equivalence checks |
| Perf ceiling          | Native Zig — high throughput on large frames                                   | TS pipeline with dirty flags, scroll tiers, sticky children — lower ceiling, much more inspectable                          |
| Hackability           | Bugs go through a Zig core + release cycle; binaries per platform              | Bugs fix in-repo, submodule, no native toolchain                                                                            |
| Ecosystem maturity    | Young (repo July 2025), but already has a flagship user and community forks    | Same maturity, narrower consumer base (km)                                                                                  |
| Breadth of components | Primitives only; opencode ships its own dialogs/prompts/lists                  | Canonical component library is a first-class deliverable (SelectList, TextInput, ListView, focusScope, etc.)                |

## What this tells us about positioning

1. **The "framework + showcase" pattern is now validated**. Silvery's premise — "a general-purpose TUI library where km is the reference app" — is exactly what anomalyco is doing with OpenTUI + opencode, and they rode it to 10k+ stars on the library and 143k+ on the showcase in under a year. This is encouraging, not threatening: it proves the market.
2. **Silvery's differentiators are real and defensible.**
   - **Testing rigor**: `SILVERY_STRICT`, termless, replay==incremental, invariants. None of the alternatives (OpenTUI, Ink, Textual, Ratatui) come close. This is the single biggest moat for a project like km that depends on correctness more than FPS.
   - **Declarative canonical components**: silvery ships SelectList/TextInput/ListView/focusScope/theming as part of the library. OpenTUI hands you primitives and tells you to build your own — which opencode does at length.
   - **State-machine philosophy**: km's `(action, state) → [state, effects]` design enables undo, replay, collaboration, AI automation. OpenTUI + Solid gives you reactive primitives; they're not a state-machine framework.
   - **Pure TypeScript hackability**: no Zig toolchain, no prebuilt binaries, no native-bug release cycle. Silvery fits in-repo as a git submodule and bugs fix in the same edit-compile loop as km.
3. **Silvery's weaknesses vs OpenTUI, honestly.**
   - **Only one framework host.** OpenTUI ships Solid _and_ React. A `@silvery/ag-solid` would cost little and answer a real question ("can silvery host anything but React?").
   - **No native perf ceiling.** For truly enormous frames, TS diffing will lose. Unlikely to matter for km or most agent TUIs, but worth being honest about.
   - **Tiny visible adoption**. km is the showcase, and km is private. OpenTUI has a public showcase (opencode) with a massive install base driving inbound interest. When silvery goes public, it needs a public showcase with traction — that is probably km's job, plus at least one external consumer.
   - **No component ecosystem analogue.** `@opentui-ui/*` is nascent but it exists. Silvery has an implicit "everything is in-repo" model. When silvery ships publicly, a component/plugin story needs to be clear.
4. **Opportunistic moves worth considering**
   - Write a direct "silvery vs OpenTUI" page (landing-page doc, not just internal), honest about the trade-offs, framing around correctness/testing/hackability vs native perf.
   - Ship a `@silvery/ag-solid` renderer to neutralize the "only React" critique — and incidentally gain a foothold with the opencode crowd.
   - Add an OpenTUI column to the existing `ink-compat` benchmarks. Today the comparison stops at Ink; OpenTUI is now the more interesting opponent.
   - Land a public showcase even before km is public (a demo app, or the silvery docs site rendered through silvery itself).
   - Watch `anomalyco/opentui` releases: anything they ship that silvery doesn't have is a feature request with market validation attached.

## Sources

- `anomalyco/opencode` — `/tmp/opencode-analysis/` clone (2026-04-15).
  - `packages/opencode/src/cli/cmd/tui/app.tsx` — OpenTUI/Solid wiring.
  - `packages/opencode/package.json` — `@opentui/core@0.1.99`, `@opentui/solid@0.1.99`, no Go deps.
  - `packages/opencode/src/pty/` — unrelated but notable: they run a PTY _subsystem_ (not the TUI's TTY) for driving interactive shell processes from the agent, exposed over WebSocket from `server/instance/pty.ts`.
- `gh api repos/anomalyco/opencode` → 143,844 stars, description "The open source coding agent."
- `gh api repos/anomalyco/opentui` → 10,380 stars, created `2025-07-21T09:35:54Z`.
- `npm view @opentui/core` → maintainers `kommander`, `fanjie`, `thdxr`; repository `anomalyco/opentui`.
- `npm search @opentui` → `@opentui/core`, `@opentui/solid`, `@opentui/react`, `@opentui-ui/*`, community forks.
