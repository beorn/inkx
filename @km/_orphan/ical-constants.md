---
id: "@km/_orphan/ical-constants"
aliases:
  - km-ical-constants
created_at: 2026-01-25T12:20:06Z
closed_at: 2026-01-25T12:27:10Z
assignee: unimac
---

# [x] Extract RFC 5545 status constants to shared module @km/_orphan #chore #P4 @unimac

Currently iCal status values are defined inline in validators:
```typescript
const eventStatuses = ['TENTATIVE', 'CONFIRMED', 'CANCELLED'] as const
```

**Improvement**: Create shared constants module with RFC 5545 values that can be used for both runtime validation and TypeScript types.

**Files**: 
- packages/@km/_orphan/connector-caldav/src/icalendar.ts
- packages/@km/_orphan/connector-caldav/src/types.ts