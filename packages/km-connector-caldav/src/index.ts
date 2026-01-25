/**
 * @km/connector-caldav
 *
 * CalDAV/CardDAV sync connector for calendar events and contacts.
 * Supports sync with Google, iCloud, Fastmail, and other CalDAV servers.
 */

export { CalDAVClient } from "./caldav-client.ts"
export { CardDAVClient } from "./carddav-client.ts"
export { parseICalendar, formatICalendar } from "./icalendar.ts"
export { parseVCard, formatVCard } from "./vcard.ts"
export type {
  CalDAVConfig,
  CardDAVConfig,
  CalendarEvent,
  Contact,
  SyncState,
} from "./types.ts"
