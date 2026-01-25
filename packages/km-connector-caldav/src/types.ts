/**
 * CalDAV/CardDAV Types
 */

/**
 * CalDAV server configuration
 */
export interface CalDAVConfig {
  /** Server URL (e.g., https://caldav.icloud.com) */
  url: string
  /** Username or email */
  username: string
  /** Password or app-specific password */
  password: string
  /** Calendar path (optional, auto-discovered if not provided) */
  calendarPath?: string
  /** Sync interval in milliseconds (default: 5 minutes) */
  syncInterval?: number
}

/**
 * CardDAV server configuration
 */
export interface CardDAVConfig {
  /** Server URL (e.g., https://contacts.icloud.com) */
  url: string
  /** Username or email */
  username: string
  /** Password or app-specific password */
  password: string
  /** Address book path (optional, auto-discovered if not provided) */
  addressBookPath?: string
  /** Sync interval in milliseconds (default: 5 minutes) */
  syncInterval?: number
}

/**
 * Calendar event
 */
export interface CalendarEvent {
  /** Unique identifier (UID from iCalendar) */
  uid: string
  /** Event summary/title */
  summary: string
  /** Event description */
  description?: string
  /** Start date/time (ISO 8601) */
  dtstart: string
  /** End date/time (ISO 8601) */
  dtend?: string
  /** Duration (ISO 8601 duration format) */
  duration?: string
  /** Location */
  location?: string
  /** All-day event */
  allDay?: boolean
  /** Recurrence rule (RRULE) */
  rrule?: string
  /** Attendees */
  attendees?: Attendee[]
  /** Organizer */
  organizer?: Organizer
  /** Status (TENTATIVE, CONFIRMED, CANCELLED) */
  status?: "TENTATIVE" | "CONFIRMED" | "CANCELLED"
  /** ETag for change detection */
  etag?: string
  /** Raw iCalendar data */
  raw?: string
}

/**
 * Event attendee
 */
export interface Attendee {
  email: string
  name?: string
  status?: "NEEDS-ACTION" | "ACCEPTED" | "DECLINED" | "TENTATIVE"
}

/**
 * Event organizer
 */
export interface Organizer {
  email: string
  name?: string
}

/**
 * Contact (vCard)
 */
export interface Contact {
  /** Unique identifier (UID from vCard) */
  uid: string
  /** Full name (FN) */
  fullName: string
  /** Name components */
  name?: {
    family?: string
    given?: string
    middle?: string
    prefix?: string
    suffix?: string
  }
  /** Email addresses */
  emails?: ContactEmail[]
  /** Phone numbers */
  phones?: ContactPhone[]
  /** Addresses */
  addresses?: ContactAddress[]
  /** Organization */
  org?: string
  /** Job title */
  title?: string
  /** Birthday (YYYY-MM-DD) */
  birthday?: string
  /** Notes */
  note?: string
  /** Photo URL or base64 */
  photo?: string
  /** ETag for change detection */
  etag?: string
  /** Raw vCard data */
  raw?: string
}

/**
 * Contact email
 */
export interface ContactEmail {
  type?: "home" | "work" | "other"
  value: string
  primary?: boolean
}

/**
 * Contact phone
 */
export interface ContactPhone {
  type?: "home" | "work" | "cell" | "fax" | "other"
  value: string
  primary?: boolean
}

/**
 * Contact address
 */
export interface ContactAddress {
  type?: "home" | "work" | "other"
  street?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
}

/**
 * Sync state for tracking changes
 */
export interface SyncState {
  /** Sync token from server (for incremental sync) */
  syncToken?: string
  /** CTag (collection tag) for change detection */
  ctag?: string
  /** Last sync timestamp */
  lastSync?: number
  /** Map of resource URL to ETag */
  etags: Record<string, string>
}

/**
 * Sync result
 */
export interface SyncResult {
  /** Added items */
  added: string[]
  /** Modified items */
  modified: string[]
  /** Deleted items */
  deleted: string[]
  /** New sync state */
  state: SyncState
}
