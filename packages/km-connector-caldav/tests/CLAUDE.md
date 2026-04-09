# km-connector-caldav Tests

**Connector Layer — CalDAV/CardDAV/WebDAV**: RFC-compliant calendar and contact sync with remote servers.

## What to Test Here

- CalDAV client: calendar discovery, event CRUD via REPORT/PUT/DELETE, PROPFIND XML parsing (mocked fetch)
- CardDAV client: address book discovery, contact CRUD, vCard REPORT responses (mocked fetch)
- iCalendar parsing: VEVENT fields (UID, SUMMARY, DTSTART/DTEND, all-day, description, location, recurrence, alarms)
- iCalendar formatting: round-trip parse/format fidelity
- vCard parsing: RFC 6350 fields (FN, N, EMAIL, TEL, ADR, ORG, structured name, type parameters)
- vCard formatting: round-trip parse/format fidelity
- WebDAV base: Basic Auth header generation, PROPFIND requests, principal discovery, XML response parsing

## What NOT to Test Here

- Live CalDAV server interaction — tests use mocked `globalThis.fetch`
- Calendar rendering in TUI — that's km-tui
- Event-to-node mapping at the board level — that's km-board or km-storage

## Helpers

Each client test file uses `setupMockFetch()` / `restoreFetch()` in `beforeEach`/`afterEach` to mock `globalThis.fetch`. Sample XML responses are defined as string constants for PROPFIND and REPORT results.

## Patterns

```typescript
import { parseICalendar, formatICalendar } from "../src/icalendar.ts"

test("parses basic VEVENT", () => {
  const event = parseICalendar(
    `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:test-123\nSUMMARY:Meeting\nEND:VEVENT\nEND:VCALENDAR`,
  )
  expect(event!.uid).toBe("test-123")
  expect(event!.summary).toBe("Meeting")
})
```

## Ad-Hoc Testing

```bash
bun vitest run packages/km-connector-caldav/tests/              # All connector tests
bun vitest run packages/km-connector-caldav/tests/ -t "ical"    # iCalendar parsing
bun vitest run packages/km-connector-caldav/tests/ -t "vcard"   # vCard parsing
bun vitest run packages/km-connector-caldav/tests/ -t "caldav"  # CalDAV client
```

## Efficiency

Moderate cost (~200ms) due to XML parsing and fetch mocking. No real network calls. If a test needs a live CalDAV server, mark it `.slow.` and gate behind an env var.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol
