---
mentions:
  - km
id: "@km/silvery/interactions-runtime/phase-0"
aliases:
  - km-silvery.interactions-runtime.phase-0
  - km-silvery-interactions-runtime-phase-0
created_by: Bjørn Stabell
created_at: 2026-04-06T07:01:56Z
closed_at: 2026-04-06T08:08:27Z
close_reason: "Docs created: providers.md, headless-machines.md,
  runtime-layers.md updated, READMEs updated, CLAUDE.md updated, sidebar config
  updated. All /complete criteria pass. Docs build succeeds. Commit 23db39c in
  silvery."
owner: bjorn@stabell.org
---

# [x] Phase 0: Document existing composition architecture @km/silvery #task #P1

Document silvery's existing provider composition system BEFORE touching code. Thin but accurate — enough to save discovery time for the rest of the refactor, no more. Full internal design doc rewrite deferred to Phase 6 per Pro review 2 item 5 (design is still shifting).

## Timeboxed scope (per Pro review 2 item 10)

Target: ~4-8 hours of doc work, not a multi-day documentation project. Do only what saves discovery time during later phases. Polishing happens in Phase 6 after the architecture is proven.

## Files to create/update

NEW (thin but accurate):

- vendor/silvery/docs/guide/providers.md — 'Providers and Plugins' guide: pipe() composition, existing with-* providers, how to write a custom provider. Include naming convention.
- vendor/silvery/docs/guide/headless-machines.md — '@silvery/headless' guide: purpose, existing machines (readline, select-list + soon-to-be selection, pointer, find, copy-mode), naming convention (flat, no suffix), how a machine is consumed by a provider.

UPDATE:

- vendor/silvery/docs/guide/runtime-layers.md — add short 'Composition: pipe() and Providers' section, mention the features/ subfolder convention (will exist after Phase 3)
- vendor/silvery/packages/create/README.md — add pipe() overview with-* naming rationale
- vendor/silvery/packages/headless/README.md — naming convention + 'how to write a machine' recipe
- vendor/silvery/CLAUDE.md — add 'Composition Architecture' navigation pointing to new guides
- vendor/silvery/docs/.vitepress/config.ts — add new pages to sidebar

DEFER (per Pro review 2):

- Full rewrite of vendor/internal/silvery/design/v10-terminal/text-selection-and-clipboard.md — design is still shifting. Instead add a short SUPERSEDED notice at the top pointing to @km/silvery/interactions-runtime epic. Full rewrite in Phase 6 once architecture is proven.

## Naming conventions to document

Per /big round 3 decisions:

1. **@silvery/headless machines**: flat, no suffix (selection.ts, pointer.ts, find.ts, copy-mode.ts — matches readline.ts, select-list.ts)
2. **@silvery/create providers**: with-* prefix (with-terminal.ts, with-focus.ts, with-dom-events.ts)
3. **@silvery/ag-term feature services**: features/ subfolder, file name matches headless machine (selection.ts in features/ wraps selection.ts in headless)
4. **@silvery/ag-term internals**: create/src/internal/ subfolder for runtime composition internals (input-router.ts, capability-registry.ts)
5. **@silvery/ag-react observer hooks**: useX convention (useSelection, useFindState, useCopyModeState, useDragState)

Document in providers.md and headless-machines.md.

## Delete

Nothing (docs-only phase).

## New tests

None. Docs build succeeds: cd vendor/silvery && bun run docs:build

## Definition of Done

- [ ] providers.md and headless-machines.md exist (~150-300 lines each, not encyclopedic)
- [ ] runtime-layers.md has pipe/with-* section (~30 new lines)
- [ ] create/README.md mentions pipe() with naming rationale
- [ ] headless/README.md has naming convention + write-a-machine recipe
- [ ] CLAUDE.md points to new guides
- [ ] Sidebar config includes new pages
- [ ] Internal design doc has SUPERSEDED notice at top (full rewrite deferred)
- [ ] Docs build succeeds

## /complete criteria

- grep -q 'pipe\|AppPlugin' vendor/silvery/docs/guide/runtime-layers.md
- grep -q 'withDomEvents\|with-dom-events' vendor/silvery/docs/guide/runtime-layers.md
- test -f vendor/silvery/docs/guide/providers.md
- test -f vendor/silvery/docs/guide/headless-machines.md
- grep -q 'features/' vendor/silvery/docs/guide/providers.md
- grep -q 'naming\|convention' vendor/silvery/docs/guide/headless-machines.md
- grep -q 'pipe' vendor/silvery/packages/create/README.md
- grep -q 'providers.md\|headless-machines.md' vendor/silvery/CLAUDE.md
- grep -q 'providers\|headless-machines' vendor/silvery/docs/.vitepress/config.ts
- grep -q 'SUPERSEDED\|@km/silvery/interactions-runtime' vendor/internal/silvery/design/v10-terminal/text-selection-and-clipboard.md
- cd vendor/silvery && bun run docs:build → success

## Why this phase exists

The /big round 2 exploration took several tool calls to discover pipe, AppPlugin, withDomEvents, withFocus, @silvery/headless, and the existing naming conventions. None are in docs/guide/. Fixing the discovery gap first prevents every future agent (including future me in fresh sessions) from wasting the same time.

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.

