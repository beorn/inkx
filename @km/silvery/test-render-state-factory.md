---
id: "@km/silvery/test-render-state-factory"
aliases:
  - km-silvery.test-render-state-factory
  - km-silvery-test-render-state-factory
created_by: claude:cc081a9a
created_at: 2026-04-27T20:23:07Z
---

# [ ] Test infra: createTestRenderState factory replacing @ts-expect-error partials @km/silvery #task #P3

blocks:: [[@km/silvery/paint-clear-l5-final]]

From dual-pro review of merged paint-clear (Kimi K2.6 + Gemini 3 Pro converged, 2026-04-27): NodeRenderState is the primary top-down context vehicle. Partial mocks suppressed by @ts-expect-error mask threading regressions when new fields are added. Action: add createTestRenderState(overrides?: Partial<NodeRenderState>) helper in vendor/silvery test utilities with strict defaults (selectableMode: true, inheritedFg: null, inheritedBg: null). Migrate existing tests to use it. Removes the @ts-expect-error directives that motivated the change. Reference: /tmp/llm-cc081a9a-review-the-merged-paint-clear-zudd.txt lines 80-85, 113-118.