/**
 * iCalendar Parser/Formatter
 *
 * Parse and format iCalendar (.ics) data for VEVENT components.
 * Implements RFC 5545 (iCalendar).
 */

import createDebug from "debug"
import type { CalendarEvent, Attendee } from "./types.ts"

const debug = createDebug("km:caldav:ical")

// Type validators - ensure parsed values are valid union members
const eventStatuses = ["TENTATIVE", "CONFIRMED", "CANCELLED"] as const
const attendeeStatuses = [
  "NEEDS-ACTION",
  "ACCEPTED",
  "DECLINED",
  "TENTATIVE",
] as const

function parseEventStatus(v: string | undefined): CalendarEvent["status"] {
  return v && eventStatuses.includes(v as (typeof eventStatuses)[number])
    ? (v as CalendarEvent["status"])
    : undefined
}

function parseAttendeeStatus(v: string | undefined): Attendee["status"] {
  return v && attendeeStatuses.includes(v as (typeof attendeeStatuses)[number])
    ? (v as Attendee["status"])
    : undefined
}

/**
 * Parse iCalendar data to CalendarEvent
 */
export function parseICalendar(ical: string): CalendarEvent | null {
  debug("parseICalendar: %d bytes", ical.length)
  // Unfold lines (RFC 5545: lines can be wrapped with CRLF + whitespace)
  const unfolded = ical.replace(/\r?\n[ \t]/g, "")

  // Find VEVENT component
  const veventMatch = unfolded.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/)
  if (!veventMatch) {
    debug("parseICalendar: no VEVENT found")
    return null
  }

  const vevent = veventMatch[1] || ""

  // Extract properties
  const getValue = (name: string): string | undefined => {
    const regex = new RegExp(`^${name}[;:](.*)$`, "im")
    const match = vevent.match(regex)
    if (!match) return undefined
    // Handle property parameters (e.g., DTSTART;VALUE=DATE:20240115)
    const value = match[1]?.split(":").pop()
    return value?.trim()
  }

  const uid = getValue("UID")
  const summary = getValue("SUMMARY")

  if (!uid || !summary) {
    debug("parseICalendar: missing UID or SUMMARY")
    return null
  }

  const event: CalendarEvent = {
    uid,
    summary,
    description: getValue("DESCRIPTION"),
    dtstart: formatDateTime(getValue("DTSTART")),
    dtend: formatDateTime(getValue("DTEND")),
    duration: getValue("DURATION"),
    location: getValue("LOCATION"),
    rrule: getValue("RRULE"),
    status: parseEventStatus(getValue("STATUS")),
  }

  // Check if all-day event (DATE vs DATE-TIME)
  const dtstartLine = vevent.match(/^DTSTART[;:](.*)$/im)?.[1]
  if (
    dtstartLine?.includes("VALUE=DATE") &&
    !dtstartLine.includes("DATE-TIME")
  ) {
    event.allDay = true
  }

  // Parse attendees
  const attendeeRegex = /^ATTENDEE[;:](.*)$/gim
  const attendees: Attendee[] = []
  let match
  while ((match = attendeeRegex.exec(vevent)) !== null) {
    const line = match[1]
    const email = line?.match(/mailto:([^;:\s]+)/i)?.[1]
    const name = line?.match(/CN=([^;:]+)/i)?.[1]?.replace(/"/g, "")
    const partstat = line?.match(/PARTSTAT=([^;:]+)/i)?.[1]

    if (email) {
      attendees.push({
        email,
        name,
        status: parseAttendeeStatus(partstat),
      })
    }
  }
  if (attendees.length > 0) {
    event.attendees = attendees
  }

  // Parse organizer
  const organizerLine = vevent.match(/^ORGANIZER[;:](.*)$/im)?.[1]
  if (organizerLine) {
    const email = organizerLine.match(/mailto:([^;:\s]+)/i)?.[1]
    const name = organizerLine.match(/CN=([^;:]+)/i)?.[1]?.replace(/"/g, "")
    if (email) {
      event.organizer = { email, name }
    }
  }

  debug("parseICalendar: parsed %s (%s)", uid, summary)
  return event
}

/**
 * Format CalendarEvent to iCalendar
 */
export function formatICalendar(event: CalendarEvent): string {
  debug("formatICalendar: %s (%s)", event.uid, event.summary)
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//km//Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatDateTimeForIcal(new Date().toISOString())}`,
    `SUMMARY:${escapeValue(event.summary)}`,
  ]

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeValue(event.description)}`)
  }

  if (event.dtstart) {
    if (event.allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${event.dtstart.replace(/-/g, "").slice(0, 8)}`,
      )
    } else {
      lines.push(`DTSTART:${formatDateTimeForIcal(event.dtstart)}`)
    }
  }

  if (event.dtend) {
    if (event.allDay) {
      lines.push(
        `DTEND;VALUE=DATE:${event.dtend.replace(/-/g, "").slice(0, 8)}`,
      )
    } else {
      lines.push(`DTEND:${formatDateTimeForIcal(event.dtend)}`)
    }
  }

  if (event.duration) {
    lines.push(`DURATION:${event.duration}`)
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeValue(event.location)}`)
  }

  if (event.rrule) {
    lines.push(`RRULE:${event.rrule}`)
  }

  if (event.status) {
    lines.push(`STATUS:${event.status}`)
  }

  if (event.organizer) {
    const cn = event.organizer.name ? `CN=${event.organizer.name};` : ""
    lines.push(`ORGANIZER;${cn}mailto:${event.organizer.email}`)
  }

  if (event.attendees) {
    for (const attendee of event.attendees) {
      const cn = attendee.name ? `CN=${attendee.name};` : ""
      const partstat = attendee.status ? `PARTSTAT=${attendee.status};` : ""
      lines.push(`ATTENDEE;${cn}${partstat}mailto:${attendee.email}`)
    }
  }

  lines.push("END:VEVENT", "END:VCALENDAR")

  return lines.join("\r\n")
}

/**
 * Format date/time string from iCalendar format
 */
function formatDateTime(value: string | undefined): string {
  if (!value) return ""

  // Handle basic date: 20240115
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }

  // Handle date-time: 20240115T103000Z or 20240115T103000
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    const time = `${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`
    const tz = value.endsWith("Z") ? "Z" : ""
    return `${date}T${time}${tz}`
  }

  return value
}

/**
 * Format ISO date-time for iCalendar
 */
function formatDateTimeForIcal(iso: string): string {
  // Convert 2024-01-15T10:30:00Z to 20240115T103000Z
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/**
 * Escape special characters in iCalendar values
 */
function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}
