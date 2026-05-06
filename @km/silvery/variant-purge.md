---
mentions:
  - km
  - claude
id: "@km/silvery/variant-purge"
aliases:
  - km-silvery.variant-purge
  - km-silvery-variant-purge
created_by: claude:22c2717d
created_at: 2026-04-25T16:44:05Z
closed_at: 2026-04-25T16:49:48Z
close_reason: Closed
started_at: 2026-04-25T16:44:10Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.variant-purge
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-25T09:44:09Z
    created_by: claude:22c2717d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.sterling
---

# [x] Purge tone aliases — variant everywhere @km/silvery #task #P2 @claude:22c2717d

blocks:: [[@km/all/sterling]]

After Option B (variant prop), the old tone aliases were retained one cycle for compatibility. /refactor lessons (Case Study 7): "deprecated annotations standing in for actual deletion" is NOT done. Purge the dual paths.

## Acceptance criteria

After this lands, all of these greps return 0 hits:

1. `rg 'tone\?:' vendor/silvery/packages/ag-react/src/ui/components/` — no tone props on components
2. `rg 'ToneKey|ToneFillTokens|ToneSubtleTokens' --glob '!*.lock'` — no deprecated type aliases
3. `rg 'toneFillTokens|toneFgToken|toneSubtleTokens|toneIcon|TONE_ICONS' --glob '!*.lock'` — no deprecated function aliases
4. `rg 'tone="' vendor/silvery hub/silvery` — no JSX tone= usage in silvery code/docs (silvercode UserMessageBlock has its own `tone` prop, unrelated)
5. Test files renamed: badge-toast-tone → badge-toast-variant, button-tone → button-variant
6. All vendor/silvery + km tests passing

## Out of scope

- apps/silvercode/src/components/DetectionText.tsx — has its own `tone` prop unrelated to Sterling
- /termless ghostty-src .github file — vendored-vendored, not silvery's concern

