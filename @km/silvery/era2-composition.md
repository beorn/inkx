---
id: "@km/silvery/era2-composition"
aliases:
  - km-silvery.era2-composition
  - km-silvery-era2-composition
created_by: claude:f8196c1c
created_at: 2026-03-21T01:18:58Z
closed_at: 2026-03-25T03:51:18Z
close_reason: "Completed: app-composition.md design doc written, GPT Pro
  reviewed twice, 00-overview.md created with full file map + implementation
  phases + package mapping. Decisions 36 (providers dissolve) and 37
  (era2a/era2b split) captured. Remaining work tracked as era2a phase beads."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Era2 composition: plugins, providers, typed deps, effects @km/silvery #task #P0 @claude:f8196c1c

Design the era2 composition system. How plugins, providers, renderers, and effects compose with typed dependencies.

## Decisions made (2026-03-20)

- Decision 36: Plugins and providers use same mechanism ((app)=>app). Difference is coupling: plugins tight (wrap internals), providers loose (satisfy interface, swapped at run()).
- run(view, { term, ai, fs }) pattern: providers are runtime environment.
- Provides/Requires accumulation through pipe(), resolved at run().
- Effects-as-data: AsyncEffect descriptors, not generators. yield for streaming only.
- Renderer: one per Ag root, one adapter per root. withReactDom bypasses Ag.

## Open questions

1. What is an 'app'? Domain logic only vs full composed object?
2. app.providers.ai vs app.ai namespace?
3. TypeScript Provides/Requires mechanism? (GPT research pending)
4. Can Ag trees share adapters at different subtrees?
5. Commands vs effects vs updaters — unify mechanism, keep namespaces?
6. Are providers truly different from plugins or just a convention?

## Research

- GPT 5.4 Pro typed composition research (3 attempts, may still be running)
- GPT 5.4 Pro renderer composition (completed, see memory)
- 4 prototype reviews ( total)

## Next steps

1. Read GPT typed composition research when it lands
2. Revise Decision 36 with full picture
3. Decide namespace (app.providers vs app.ai)
4. Update era2 docs (04-app.md, 00-architecture.md)
5. Update prototype to final design