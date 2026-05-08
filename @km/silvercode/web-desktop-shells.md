---
aliases:
  - km-silvercode.web-desktop-shells
  - km-silvercode-web-desktop-shells
created_at: 2026-05-07T21:49:00.842Z
_stub: true
props:
  blocked-by:
    type: link
    target: "@km/silvercode/state-split-client-server.md"
propsRaw:
  blocked-by: "[[@km/silvercode/state-split-client-server.md]]"
---

Mirror opencode's deployment story for silvercode, but via Silvery's multi-target rendering instead of Solid + DOM. Position-honest: per CLAUDE.md, *Silvery is a multi-target UI framework with web ambitions* — terminal is the primary shipped target today, canvas + DOM are explicit future targets. Silvercode is silvery's lead showcase app, so a web/desktop deployment story is the test of whether silvery's multi-target ambition cashes out for a real product.

## Reference shape (opencode)

opencode ships its UI as a published library, then composes shells over it:

- `@opencode-ai/app` (`packages/app/`, Solid + Tailwind, ~170 component/context/route files) — exports `<AppInterface>`, `<AppBaseProviders>`, `<ServerConnection>`, `<PlatformProvider>`, `useCommand`, file-picker constants, locale loader. The whole UI as one component tree.
- `packages/desktop/` (Electron) — main + renderer. Renderer mounts `<AppInterface>`; main process handles IPC, sidecar `opencode serve`, OS menus. ~30 files of glue, no UI of its own.
- `packages/app/` standalone web build — same library, vite dev server, hits `localhost:4096` for backend.
- All three shells consume the same `@opencode-ai/sdk` typed HTTP client, generated from the OpenAPI spec.

The doctrine: *UI = thin SDK client over a server that owns the session.* opencode put server-state ownership outside the UI on purpose so the same component tree adapts to web vs. Electron vs. anything else.

## Silvercode equivalent — sketch

- **`@silvercode/app`** (new package) — the silvercode UI as a target-portable silvery component tree. `<SilvercodeInterface>`, `<SilvercodeProviders>`, `<ServerConnection>` (or `<SessionConnection>`), `<PlatformProvider displayBackend={"terminal" | "canvas" | "dom"}>`. Reuses everything in `apps/silvercode/src/components/*` + the `controller.ts` / signals layer, but as a library, not bolted to the CLI binary.
- **`@silvercode/desktop`** (new) — Electron (or Tauri) shell. Renderer mounts `<SilvercodeInterface>` with `displayBackend="dom"`; main process owns the silvercode-server sidecar lifecycle.
- **`@silvercode/web`** (new) — standalone web SPA. Vite + `@silvery/dom`. Hits a silvercode server over HTTP.
- **`apps/silvercode/` (today)** — keeps the terminal CLI as one of N shells. `<SilvercodeInterface>` with `displayBackend="terminal"`.

## Architectural prerequisites (the real work)

This is a multi-bead epic, not a single PR. Prereqs surface in dependency order:

1. **Silvery multi-target maturity** — `@silvery/canvas` and `@silvery/dom` need to render the silvercode component set (Composer, SidePanel, PermissionInbox, AmbientStream, plan drawer, history browser, dialog primitives). Today they exist as targets but are not battle-tested for a complex product surface. Gate: silvery showcase renders in canvas + DOM with parity to terminal. Tracked under `@km/silvery` epics, not here.
2. **Client/server state split** — see [`@km/silvercode/state-split-client-server`](state-split-client-server.md). Audit every silvercode signal/store and bucket into server-canonical / client-local / shared. This is the prerequisite to any server extraction — until you know what's server-canonical, "the server" is undefined. Mirrors km's storage v5 + `@km/web` split (per `docs/architecture.md` §Storage and the events-table seam). **Tracked as the formal blocker** of this epic via `km bd dep add @km/silvercode/web-desktop-shells @km/silvercode/state-split-client-server`.
3. **Silvercode server extraction** — once the split is bucketed, extract the server-canonical layer into `packages/silvercode-server`. Today silvercode is in-process: ACP sessions live as Bun subprocesses spawned by the silvercode binary; `CrossAgentState`, `ChannelQueue`, controller signals all live in the same Node process as the renderer. Web/desktop shells need session state owned *outside* the renderer. Two paths:
- Path A: `silvercode serve` — headless silvercode server (HTTP API + SSE), shells are SDK clients. Mirrors opencode's split exactly. Heavier lift; cleanest end state.
- Path B: shells own their own silvercode session subprocess (like `opencode attach` but per-shell). Simpler; doesn't enable many-UIs-one-server scenarios.
- Decide: Path A for squad-mode-across-machines + browser future; Path B as a stepping stone.
4. **Typed silvercode SDK** — generate from the silvercode-server OpenAPI (Path A) or define a typed RPC over child-process IPC (Path B). Auto-generated client like `@opencode-ai/sdk`. silvercode terminal CLI also adopts it for symmetry.
5. **Component portability audit** — every silvercode component (controller-driven panes, ambient inline display, permission inbox, plan drawer, side panel, history browser, dialog primitives) must work without terminal-only assumptions. Hover/click/focus are first-class — terminal already supports them via silvery, but DOM/canvas need parity verified.
6. **Theme parity** — silvery semantic theme tokens (`$primary`, `$muted`) must produce visually-coherent results across terminal / canvas / DOM. Out-of-band: light/dark mode in DOM is real; in terminal it's the user's terminal theme. Theme provider must fork by target.

## Connection to existing beads + docs

- **Blocked by** `@km/silvercode/state-split-client-server` (P2) — formal `bd dep` edge. State taxonomy must be done first.
- `@km/silvercode/borrow-paperclip-execution-target` (P1) — Paperclip's `execution-target` abstraction is exactly the seam silvercode-server needs once it grows non-local agent spawn (sandbox/SSH/remote). Lands first as a local-only seam; sub-beads from *this* epic extend it.
- `@km/silvercode/borrow-openclaw-execution-trace` (P1) — the normalized SessionTrace shape is what flows over the wire when client/server is split. Its acceptance includes "wire it through ACP session pipe" — the wire becomes load-bearing for this epic.
- `@km/silvercode/borrow-paperclip-claude-failure-types` (P1) — typed failure detectors that surface in `_meta.failureFamily`; once client/server is split, these become the contract by which the client renders typed retry CTAs even though the server owns the actual retry decision.
- `@km/silvercode/borrow-skills-fingerprint-materialization` (P1) — the fingerprint write-pattern is only correct on the server side once split (skills are workspace-scoped, not pane-scoped); this bead's design influences where skill materialization lives.
- `@km/silvercode/expand-builtin-agents-acp-registry` (P1) — adds opencode/kilo/goose/auggie/qwen-code as ACP registry agents. Independent of this epic but compounds: more agents × multi-target shells × multi-machine squad mode = the full multi-target story.
- `@km/silvercode/opencode-sdk-embed-investigation` (P2, to be filed) — investigates `createOpencodeServer()` SDK embed for squad-mode. *Possible* prerequisite to this bead if silvercode-server ends up reusing opencode-server's HTTP-API design language.
- `hub/silvercode/future/ai-terminal/` — the broader agent-host landscape; this bead extends "silvercode beyond the terminal" outside what those docs cover.
- CLAUDE.md § Positioning — *silvery is multi-target with web ambitions; design trade-offs default to the cross-platform / Polaris-aligned answer, not the TUI idiom.* This bead is the operationalization of that promise.
- `docs/silvery-positioning-brief.md` — required context for any `/pro` or external-LLM consultation on this bead.
- `docs/architecture.md` §Storage + km-storage v5 progress memo — the precedent. Same shape of problem (signal-rich runtime carving out a server-canonical layer with CRDT-ready columns), one epic earlier in time.

## Acceptance — what "done" looks like

This is an epic; sub-beads land per phase. Not all are required for first deployable.

- [ ] `hub/silvercode/design/multi-target-deployment.md` — design doc covering Path A vs B decision, package layout, target-by-target component portability matrix, theme story, server-state ownership story, sidecar lifecycle.
- [ ] Sub-bead — `@km/silvercode/server-extraction` — extract silvercode core into `packages/silvercode-server` with HTTP API or typed IPC.
- [ ] Sub-bead — `@km/silvercode/sdk-generate` — typed client(s) generated/handwritten for the chosen contract.
- [ ] Sub-bead — `@km/silvercode/app-package` — `@silvercode/app` library; CLI binary becomes a thin shell over it (regression test).
- [ ] Sub-bead — `@km/silvercode/desktop-shell` — Electron/Tauri shell mounting `<SilvercodeInterface>` via `@silvery/dom`.
- [ ] Sub-bead — `@km/silvercode/web-shell` — standalone web SPA via `@silvery/dom`.
- [ ] Optional sub-bead — canvas-target shell (gaming / overlay / kiosk experiments) via `@silvery/canvas`.
- [ ] Demo: same silvercode session attachable from terminal + web + desktop simultaneously, ambient pipeline + permission inbox + cross-agent state visible everywhere.

## Out of scope

- Hosted / cloud deployment (paperclip-style multi-tenant) — separate bead.
- Mobile (iOS/Android) shells — separate epic; `@silvery/dom` runs there in theory but UX needs different work.
- Squad-mode across machines — covered by tribe + cross-agent broadcasts; a deployable web/desktop shell is necessary but not sufficient for that.

## Notes

- Per CLAUDE.md, vendor packages (silvery, flexily, etc.) are git submodules — fix forward, don't work around. Silvercode's web/desktop deployment will surface multi-target gaps in silvery; those gaps are silvery beads, not silvercode beads.
- Per CLAUDE.md vendor independence: `@silvercode/app`, `@silvercode/desktop`, `@silvercode/web` if published become subject to vendor-package independence rules (no `workspace:*` deps). Decide publish vs internal-only when each sub-bead lands.
- Per CLAUDE.md *no major versions without approval*: this work likely justifies silvercode 1.0 framing; that flip requires user approval per memory.

References:

- opencode `packages/app/src/index.ts` — exported surface
- opencode `packages/app/vite.js` — vite plugin pattern
- opencode `packages/desktop/src/main/sidecar.ts` — server-sidecar lifecycle
- silvery showcase + The Silvery Way (`vendor/silvery/docs/guide/the-silvery-way.md`)
- Existing silvercode CLAUDE.md: this is the multi-target ambition compounding the terminal-first work.

