---
id: "@km/silvery/backdrop-hardening/realize-kitty-guard"
aliases:
  - km-silvery.backdrop-hardening.realize-kitty-guard
  - km-silvery-backdrop-hardening-realize-kitty-guard
created_by: claude:88c0e764
created_at: 2026-04-20T20:59:52Z
closed_at: 2026-04-20T21:21:42Z
close_reason: "realizeToKitty early-out now: !plan.active || !plan.kittyEnabled
  || amount<=0 || scrim===null. 5 new tests cover all guard branches. 87→92
  backdrop tests pass. Commit 969ca994."
owner: bjorn@stabell.org
assignee: claude:a1a0e667
dependencies:
  - issue_id: km-silvery.backdrop-hardening.realize-kitty-guard
    depends_on_id: km-silvery.backdrop-hardening
    type: parent-child
    created_at: 2026-04-20T14:00:07Z
    created_by: claude:88c0e764
    metadata: "{}"
---

# [x] realizeToKitty doesn't honor plan.kittyEnabled — public API contract @km/silvery #bug #P0 @claude:a1a0e667

blocks:: [[@km/silvery/backdrop-hardening]]

Pro review P1.3. realizeToKitty() only checks \`!plan.active\`. It does NOT check plan.kittyEnabled or plan.scrim !== null. Publicly exported.

## Why it matters

realizeToBuffer() respects plan's derived capability flag. realizeToKitty() relies on caller to remember to gate it. Weakens stage-split API contract; directly-called realizeToKitty in a non-Kitty context would emit junk.

## Fix

\`\`\`ts
if (!plan.active || !plan.kittyEnabled || plan.amount <= 0 || plan.scrim === null) return ""
\`\`\`

## /complete criteria

- [ ] Failing test: realizeToKitty(activePlan with kittyEnabled=false) → returns ""
- [ ] Failing test: realizeToKitty(activePlan with scrim=null) → returns ""
- [ ] Failing test: realizeToKitty(inactivePlan) → returns "" (existing, should still pass)
- [ ] All 4 Kitty overlay tests still green

## Parent

@km/silvery/backdrop-hardening