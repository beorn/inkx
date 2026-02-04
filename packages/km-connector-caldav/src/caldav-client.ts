/**
 * CalDAV Client
 *
 * WebDAV-based client for CalDAV calendar sync.
 * Implements RFC 4791 (CalDAV) and RFC 6578 (WebDAV Sync).
 */

import { createConditionalLogger } from "@beorn/logger"
import type {
  CalDAVConfig,
  CalendarEvent,
  SyncResult,
  SyncState,
} from "./types.ts"
import { parseICalendar, formatICalendar } from "./icalendar.ts"
import { createBasicAuthHeader, webdavRequest } from "./webdav-base.ts"

const log = createConditionalLogger("km:caldav:client")

/** CalDAV client interface returned by createCalDAVClient */
export type CalDAVClient = ReturnType<typeof createCalDAVClient>

/**
 * Create a CalDAV client for syncing calendar events
 */
export function createCalDAVClient(config: CalDAVConfig) {
  let calendarUrl: string | null = null
  const authHeader = createBasicAuthHeader(config.username, config.password)

  /** Make a WebDAV request */
  async function request(
    method: string,
    url: string,
    body?: string,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return webdavRequest(method, url, authHeader, body, headers)
  }

  return {
    /**
     * Discover the calendar URL using PROPFIND
     */
    async discover(): Promise<string> {
      log.debug?.(`discover: starting for ${config.url}`)
      if (config.calendarPath) {
        calendarUrl = `${config.url}${config.calendarPath}`
        log.debug?.(`discover: using configured path ${calendarUrl}`)
        return calendarUrl
      }

      // Use current-user-principal to find calendar home
      const propfind = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`

      const response = await request("PROPFIND", config.url, propfind, {
        Depth: "0",
      })

      const text = await response.text()
      // Parse response to find principal URL
      const principalMatch = text.match(/<D:href>([^<]+)<\/D:href>/)
      if (principalMatch) {
        const principalUrl = principalMatch[1]
        // Then find calendar-home-set
        const homeResponse = await request(
          "PROPFIND",
          `${config.url}${principalUrl}`,
          `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>`,
          { Depth: "0" },
        )

        const homeText = await homeResponse.text()
        const homeMatch = homeText.match(
          /<C:calendar-home-set>.*?<D:href>([^<]+)<\/D:href>/s,
        )
        if (homeMatch) {
          calendarUrl = `${config.url}${homeMatch[1]}`
          return calendarUrl
        }
      }

      // Fallback: use the config URL directly
      calendarUrl = config.url
      return calendarUrl
    },

    /**
     * Get all calendar events
     */
    async getEvents(): Promise<CalendarEvent[]> {
      log.debug?.(`getEvents: fetching from ${calendarUrl ?? "(discovering)"}`)
      if (!calendarUrl) {
        await this.discover()
      }

      const report = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`

      const response = await request("REPORT", calendarUrl ?? "", report, {
        Depth: "1",
      })

      const text = await response.text()
      const events: CalendarEvent[] = []

      // Parse multiget response
      const responseRegex =
        /<D:response>[\s\S]*?<D:href>([^<]+)<\/D:href>[\s\S]*?<D:getetag>"?([^"<]+)"?<\/D:getetag>[\s\S]*?<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data>[\s\S]*?<\/D:response>/g

      let match
      while ((match = responseRegex.exec(text)) !== null) {
        const etag = match[2]
        const icalData = match[3]
          ?.replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")

        if (icalData) {
          const event = parseICalendar(icalData)
          if (event) {
            event.etag = etag
            event.raw = icalData
            events.push(event)
          }
        }
      }

      log.debug?.(`getEvents: found ${events.length} events`)
      return events
    },

    /**
     * Create a new calendar event
     */
    async createEvent(event: CalendarEvent): Promise<void> {
      log.debug?.(`createEvent: ${event.uid}`)
      if (!calendarUrl) {
        await this.discover()
      }

      const ical = formatICalendar(event)
      const url = `${calendarUrl}/${event.uid}.ics`

      await request("PUT", url, ical, {
        "Content-Type": "text/calendar; charset=utf-8",
        "If-None-Match": "*", // Only create if doesn't exist
      })
    },

    /**
     * Update an existing calendar event
     */
    async updateEvent(event: CalendarEvent): Promise<void> {
      log.debug?.(`updateEvent: ${event.uid} (etag=${event.etag ?? "none"})`)
      if (!calendarUrl) {
        await this.discover()
      }

      const ical = formatICalendar(event)
      const url = `${calendarUrl}/${event.uid}.ics`

      const headers: Record<string, string> = {
        "Content-Type": "text/calendar; charset=utf-8",
      }
      if (event.etag) {
        headers["If-Match"] = event.etag
      }

      await request("PUT", url, ical, headers)
    },

    /**
     * Delete a calendar event
     */
    async deleteEvent(uid: string, etag?: string): Promise<void> {
      log.debug?.(`deleteEvent: ${uid} (etag=${etag ?? "none"})`)
      if (!calendarUrl) {
        await this.discover()
      }

      const url = `${calendarUrl}/${uid}.ics`
      const headers: Record<string, string> = {}
      if (etag) {
        headers["If-Match"] = etag
      }

      await request("DELETE", url, undefined, headers)
    },

    /**
     * Sync calendar using WebDAV sync (RFC 6578)
     */
    async sync(state?: SyncState): Promise<SyncResult> {
      log.debug?.(`sync: starting (hasToken=${!!state?.syncToken})`)
      if (!calendarUrl) {
        await this.discover()
      }

      const result: SyncResult = {
        added: [],
        modified: [],
        deleted: [],
        state: state || { etags: {} },
      }

      if (state?.syncToken) {
        await processIncrementalSync(request, calendarUrl ?? "", state, result)
      } else {
        await processFullSync(this.getEvents.bind(this), state, result)
      }

      log.debug?.(
        `sync: added=${result.added.length} modified=${result.modified.length} deleted=${result.deleted.length}`,
      )
      return result
    },
  }
}

/** Type for the internal WebDAV request function */
type RequestFn = (
  method: string,
  url: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<Response>

/**
 * Process incremental sync using WebDAV sync-collection (RFC 6578).
 * Sends a sync-collection REPORT with the existing sync token and
 * classifies each response as added, modified, or deleted.
 */
async function processIncrementalSync(
  request: RequestFn,
  calendarUrl: string,
  state: SyncState,
  result: SyncResult,
): Promise<void> {
  const syncReport = `<?xml version="1.0" encoding="utf-8"?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token>${state.syncToken}</D:sync-token>
  <D:sync-level>1</D:sync-level>
  <D:prop>
    <D:getetag/>
  </D:prop>
</D:sync-collection>`

  const response = await request("REPORT", calendarUrl, syncReport)
  const text = await response.text()

  // Update sync token if server provided a new one
  const newSyncToken = text.match(/<D:sync-token>([^<]+)<\/D:sync-token>/)?.[1]
  if (newSyncToken) {
    result.state.syncToken = newSyncToken
  }

  // Process changes from each response element
  const changeRegex =
    /<D:response>[\s\S]*?<D:href>([^<]+)<\/D:href>[\s\S]*?(?:<D:getetag>"?([^"<]+)"?<\/D:getetag>)?[\s\S]*?(?:<D:status>HTTP\/1\.1 (\d+)[^<]*<\/D:status>)?[\s\S]*?<\/D:response>/g

  let match
  while ((match = changeRegex.exec(text)) !== null) {
    const href = match[1]
    const etag = match[2]
    const status = match[3]

    const uid = href?.match(/([^/]+)\.ics$/)?.[1]
    if (!uid) continue

    if (status === "404" || !etag) {
      // Deleted
      result.deleted.push(uid)
      delete result.state.etags[uid]
    } else if (state.etags[uid]) {
      if (state.etags[uid] !== etag) {
        // Modified
        result.modified.push(uid)
        result.state.etags[uid] = etag
      }
    } else {
      // Added
      result.added.push(uid)
      result.state.etags[uid] = etag
    }
  }
}

/**
 * Process full sync by fetching all events and comparing etags
 * against the previous state. Used when no sync token is available.
 */
async function processFullSync(
  getEvents: () => Promise<CalendarEvent[]>,
  state: SyncState | undefined,
  result: SyncResult,
): Promise<void> {
  const events = await getEvents()
  const newEtags: Record<string, string> = {}

  for (const event of events) {
    newEtags[event.uid] = event.etag || ""

    if (state?.etags[event.uid]) {
      if (state.etags[event.uid] !== event.etag) {
        result.modified.push(event.uid)
      }
    } else {
      result.added.push(event.uid)
    }
  }

  // Find deleted: UIDs present in old state but missing from current events
  if (state?.etags) {
    for (const uid of Object.keys(state.etags)) {
      if (!newEtags[uid]) {
        result.deleted.push(uid)
      }
    }
  }

  result.state.etags = newEtags
  result.state.lastSync = Date.now()
}
