/**
 * iCalendar Parser/Formatter Tests
 *
 * Tests for RFC 5545 iCalendar parsing and formatting.
 */

import { describe, test, expect } from "vitest"
import { parseICalendar, formatICalendar } from "../src/icalendar.ts"

describe("parseICalendar", () => {
  test("parses basic VEVENT", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-event-123
SUMMARY:Team Meeting
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).not.toBeNull()
    expect(event!.uid).toBe("test-event-123")
    expect(event!.summary).toBe("Team Meeting")
    expect(event!.dtstart).toBe("2024-01-15T10:00:00Z")
    expect(event!.dtend).toBe("2024-01-15T11:00:00Z")
  })

  test("parses all-day event", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:all-day-123
SUMMARY:Vacation Day
DTSTART;VALUE=DATE:20240120
DTEND;VALUE=DATE:20240121
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).not.toBeNull()
    expect(event!.uid).toBe("all-day-123")
    expect(event!.summary).toBe("Vacation Day")
    expect(event!.allDay).toBe(true)
    expect(event!.dtstart).toBe("2024-01-20")
    expect(event!.dtend).toBe("2024-01-21")
  })

  test("parses event with description and location", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:detailed-event
SUMMARY:Project Review
DESCRIPTION:Review Q1 progress and plan Q2
LOCATION:Conference Room A
DTSTART:20240201T140000Z
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).not.toBeNull()
    expect(event!.description).toBe("Review Q1 progress and plan Q2")
    expect(event!.location).toBe("Conference Room A")
  })

  test("parses event with recurrence rule", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recurring-event
SUMMARY:Weekly Standup
DTSTART:20240108T090000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).not.toBeNull()
    expect(event!.rrule).toBe("FREQ=WEEKLY;BYDAY=MO")
  })

  test("parses event with attendees", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:meeting-with-attendees
SUMMARY:Planning Meeting
DTSTART:20240115T100000Z
ORGANIZER;CN=Alice Smith:mailto:alice@example.com
ATTENDEE;CN=Bob Jones;PARTSTAT=ACCEPTED:mailto:bob@example.com
ATTENDEE;CN=Carol White;PARTSTAT=TENTATIVE:mailto:carol@example.com
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).not.toBeNull()
    expect(event!.organizer).toEqual({
      email: "alice@example.com",
      name: "Alice Smith",
    })
    expect(event!.attendees).toHaveLength(2)
    expect(event!.attendees![0]).toEqual({
      email: "bob@example.com",
      name: "Bob Jones",
      status: "ACCEPTED",
    })
    expect(event!.attendees![1]).toEqual({
      email: "carol@example.com",
      name: "Carol White",
      status: "TENTATIVE",
    })
  })

  test("parses event with status", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:confirmed-event
SUMMARY:Confirmed Meeting
DTSTART:20240115T100000Z
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).not.toBeNull()
    expect(event!.status).toBe("CONFIRMED")
  })

  test("handles folded lines", () => {
    // RFC 5545 allows lines to be wrapped with CRLF + whitespace
    // Note: Folding removes the CRLF and leading whitespace, joining directly
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:folded-event
SUMMARY:This is a very long summary that has been
 folded across multiple lines
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).not.toBeNull()
    // Folding removes newline and leading whitespace, joining directly
    // "been\n folded" becomes "beenfolded"
    expect(event!.summary).toBe("This is a very long summary that has beenfolded across multiple lines")
  })

  test("returns null for invalid iCalendar without VEVENT", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).toBeNull()
  })

  test("returns null for VEVENT without required fields", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)
    expect(event).toBeNull()
  })
})

describe("formatICalendar", () => {
  test("formats basic event", () => {
    const event = {
      uid: "test-event-123",
      summary: "Team Meeting",
      dtstart: "2024-01-15T10:00:00Z",
      dtend: "2024-01-15T11:00:00Z",
    }

    const ical = formatICalendar(event)
    expect(ical).toContain("BEGIN:VCALENDAR")
    expect(ical).toContain("VERSION:2.0")
    expect(ical).toContain("UID:test-event-123")
    expect(ical).toContain("SUMMARY:Team Meeting")
    expect(ical).toContain("DTSTART:20240115T100000Z")
    expect(ical).toContain("DTEND:20240115T110000Z")
    expect(ical).toContain("END:VCALENDAR")
  })

  test("formats all-day event", () => {
    const event = {
      uid: "all-day-123",
      summary: "Vacation",
      dtstart: "2024-01-20",
      dtend: "2024-01-21",
      allDay: true,
    }

    const ical = formatICalendar(event)
    expect(ical).toContain("DTSTART;VALUE=DATE:20240120")
    expect(ical).toContain("DTEND;VALUE=DATE:20240121")
  })

  test("formats event with description and location", () => {
    const event = {
      uid: "detailed-event",
      summary: "Project Review",
      description: "Review Q1 progress",
      location: "Room A",
      dtstart: "2024-02-01T14:00:00Z",
    }

    const ical = formatICalendar(event)
    expect(ical).toContain("DESCRIPTION:Review Q1 progress")
    expect(ical).toContain("LOCATION:Room A")
  })

  test("formats event with recurrence rule", () => {
    const event = {
      uid: "recurring-event",
      summary: "Weekly Standup",
      dtstart: "2024-01-08T09:00:00Z",
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    }

    const ical = formatICalendar(event)
    expect(ical).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO")
  })

  test("formats event with organizer and attendees", () => {
    const event = {
      uid: "meeting-123",
      summary: "Planning",
      dtstart: "2024-01-15T10:00:00Z",
      organizer: { email: "alice@example.com", name: "Alice" },
      attendees: [{ email: "bob@example.com", name: "Bob", status: "ACCEPTED" as const }],
    }

    const ical = formatICalendar(event)
    expect(ical).toContain("ORGANIZER;CN=Alice;mailto:alice@example.com")
    expect(ical).toContain("ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED;mailto:bob@example.com")
  })

  test("escapes special characters", () => {
    const event = {
      uid: "special-chars",
      summary: "Meeting; Topic: Planning, Review",
      description: "Line 1\nLine 2",
      dtstart: "2024-01-15T10:00:00Z",
    }

    const ical = formatICalendar(event)
    // Semicolons and commas are escaped, colons are not
    expect(ical).toContain("SUMMARY:Meeting\\; Topic: Planning\\, Review")
    expect(ical).toContain("DESCRIPTION:Line 1\\nLine 2")
  })
})

describe("round-trip", () => {
  test("parse then format preserves data", () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:round-trip-test
SUMMARY:Test Event
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
DESCRIPTION:A test event
LOCATION:Test Room
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`

    const event = parseICalendar(ical)!
    expect(event).not.toBeNull()

    const formatted = formatICalendar(event)
    const reparsed = parseICalendar(formatted)!

    expect(reparsed.uid).toBe(event.uid)
    expect(reparsed.summary).toBe(event.summary)
    expect(reparsed.description).toBe(event.description)
    expect(reparsed.location).toBe(event.location)
    expect(reparsed.status).toBe(event.status)
  })
})
