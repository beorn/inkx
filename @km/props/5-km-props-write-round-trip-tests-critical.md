---
id: "@km/props/5-km-props-write-round-trip-tests-critical"
aliases:
  - km-props.5
  - km-props-5
  - "@km/props/5"
created_at: 2026-01-21T10:47:26Z
closed_at: 2026-01-21T12:13:28Z
---

# [x] km-props: Write round-trip tests (CRITICAL) @km/props #task #P1

Create packages/@km/markdown/tests/properties-roundtrip.test.ts with tests for:
- Single property round-trip (parse → serialize)
- Multiple properties round-trip
- Property order preservation
- Double round-trip stability (parse → serialize → parse → serialize)
- Mixed content with properties
- Data model: properties stored in data.props after parse
- Properties survive storage round-trip (JSON serialize/deserialize)

This is CRITICAL for ensuring properties don't get lost or corrupted during sync.
