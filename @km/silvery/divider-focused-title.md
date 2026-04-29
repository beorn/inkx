---
id: "@km/silvery/divider-focused-title"
aliases:
  - km-silvery.divider-focused-title
  - km-silvery-divider-focused-title
created_by: claude:2405c72e
created_at: 2026-04-28T22:16:45Z
---

# [ ] <Divider> needs colored-title + focused variant (silvery) @km/silvery #task #P3 #design

blocks:: [[@km/silvery]]

SessionPromptComposer.tsx defines QueueDivider (lines 257-275) — a hand-rolled divider that mirrors silvery's <Divider> shape but allows the title to render in arbitrary color ($warning when the queue region is focused). The component-author comment explicitly says: 'Reimplements silvery's Divider (which hard-codes the title color via <Text bold>) so we can render QUEUE HELD in $warning'. This is a genuine silvery feature gap. Per The Silvery Way principle 1 (use built-in components, NOT reimplementing them), <Divider> should accept either a 'titleColor' prop or a 'variant' / 'focused' prop that semantically promotes the title to the focus color. Once shipped, silvercode's QueueDivider can collapse to <Divider title='QUEUE HELD' titleColor="$fg-warning" />. Lives in vendor/silvery — silvery owns the fix per the 'fix vendor bugs directly' rule. Acceptance: silvery <Divider> accepts colored-title prop; silvercode QueueDivider deleted; storybook visual unchanged. Discovered during @km/silvercode/design-review walkthrough.