---
mentions:
  - km
aliases:
  - "@km/silvercode/timestamps"
  - km-silvercode.timestamps
  - km-silvercode-timestamps
created_by: claude:2405c72e
created_at: 2026-04-28T19:36:37Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.timestamps
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:36:37Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
propsRaw: {}
closed_at: 2026-05-06T22:54:23.471Z
closeReason: "Verified cbadc97f2. TimestampedRow shows exact turn timestamps
  only on cmd-hover in the nearest gutter and keeps ordinary transcript text
  unchanged. Test: bun vitest run apps/silvercode/tests/content-layout.test.tsx
  (45 passed), including cmd-hover timestamp regression; npx tsc --noEmit
  --pretty false."
---

# [x] Relative timestamps for turn boundaries — '(2m ago)' next to user/assistant heads @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Long sessions lose temporal context. The first implementation now exposes exact timestamps on cmd-hover in the nearest gutter without moving transcript content. This bead remains open if we still want always-visible relative-time chips.

Potential always-visible format: `(now)`, `(2m ago)`, `(1h ago)`, `(3d ago)`. If implemented, keep it dim and avoid widening/nudging prompt or narration text.

Files: apps/silvercode/src/components/SessionUpdateList.tsx, ExchangeItem.tsx (or wherever turn heads render).

Acceptance:

- Cmd-hover shows exact timestamps in the nearest gutter without moving content.
- Ordinary transcript text does not show timestamps by default.
- If relative chips are added, they update every 60s and are tested separately from cmd-hover exact timestamps.

## Implementation Notes

2026-05-06:

- `TimestampedRow` in `SessionUpdateList.tsx` shows formatted exact time only on cmd-hover.
- Verification: `apps/silvercode/tests/content-layout.test.tsx` includes `cmd-hovering turns shows timestamps in the nearest gutter without moving content`.
- Current implementation intentionally does not show always-visible relative chips.

