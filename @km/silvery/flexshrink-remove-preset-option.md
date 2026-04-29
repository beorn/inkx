---
id: "@km/silvery/flexshrink-remove-preset-option"
aliases:
  - km-silvery.flexshrink-remove-preset-option
  - km-silvery-flexshrink-remove-preset-option
created_by: claude:53042a7f
created_at: 2026-04-25T16:03:29Z
closed_at: 2026-04-25T16:25:14Z
close_reason: Shipped in silvery commit a3a3be96. createFlexilyZeroEngine() now
  takes no args and hard-codes CSS preset. createFlexilyZeroEngineForInkCompat()
  is the @internal Yoga-flavored escape hatch via FlexilyZeroLayoutEngineYoga
  subclass. All 4 production call sites dropped the 'css' arg. Ink-compat layer
  switched to the new ForInkCompat factory. Public API surface is now
  zero-config — production code can't accidentally pass 'yoga'. Docs updated in
  flexily + silvery + Prose docstring (Prose is now optional typography sugar).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.flexshrink-remove-preset-option
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-25T09:03:28Z
    created_by: claude:53042a7f
    metadata: "{}"
---

# [x] Remove createFlexilyZeroEngine preset option (hard-code CSS in adapter) @km/silvery #task #P3

blocks:: [[@km/silvery]]

Per user's prior request and /pro review (deferred to reduce blast radius): once the silvery flip has baked in main, remove the now-unneeded preset option from FlexilyZeroLayoutEngine.

## Cleanup steps

1. vendor/silvery/packages/ag-term/src/adapters/flexily-zero-adapter.ts:
   - Remove defaults?: 'css' | 'yoga' param from createFlexilyZeroEngine
   - Remove _defaults field + constructor arg from FlexilyZeroLayoutEngine
   - Hard-code Node.create({ defaults: 'css' }) in createNode()
2. Update doc comment: silvery uses CSS-correct defaults; consumers wanting Yoga-compat use flexily directly
3. Update the four call sites to drop the 'css' arg:
   - packages/ag-term/src/layout-engine.ts:205
   - packages/ag-term/src/browser-renderer.ts:65
   - packages/ag-term/src/xterm/index.ts:198
   - packages/ag-react/src/ui/canvas/index.ts:243
4. tests/compat/ink/helpers/render-to-string.ts: needs separate Yoga-flavored path (createFlexily directly with yoga preset, OR re-add yoga arg via different mechanism)
5. apps/silvercode/tests/visual/paragraph-wrap.test.tsx + message-wrap-truncation.test.tsx: these still call createFlexilyZeroEngine() bare — verify they still work after the cleanup

## Why deferred

/pro review 2026-04-25: 'I would postpone this to a follow-up. Reason: keeping the option during rollout reduces blast radius. If Ink or another consumer still needs old semantics temporarily, you want the escape hatch. API cleanup is easy later; rollback pressure is much higher now.'

## Acceptance

- All silvery tests pass with hardcoded CSS preset
- Ink-compat tests still use Yoga preset somehow (separate path)
- Less config surface