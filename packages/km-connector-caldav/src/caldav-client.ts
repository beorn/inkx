/**
 * CalDAV Client
 *
 * WebDAV-based client for CalDAV calendar sync.
 * Implements RFC 4791 (CalDAV) and RFC 6578 (WebDAV Sync).
 */

import type {
  CalDAVConfig,
  CalendarEvent,
  SyncState,
  SyncResult,
} from "./types.ts";
import { parseICalendar, formatICalendar } from "./icalendar.ts";

/**
 * CalDAV client for syncing calendar events
 */
export class CalDAVClient {
  private config: CalDAVConfig;
  private calendarUrl: string | null = null;

  constructor(config: CalDAVConfig) {
    this.config = config;
  }

  /**
   * Get authorization header
   */
  private getAuthHeader(): string {
    const credentials = `${this.config.username}:${this.config.password}`;
    return `Basic ${Buffer.from(credentials).toString("base64")}`;
  }

  /**
   * Make a WebDAV request
   */
  private async request(
    method: string,
    url: string,
    body?: string,
    headers?: Record<string, string>,
  ): Promise<Response> {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/xml; charset=utf-8",
        ...headers,
      },
      body,
    });

    if (!response.ok && response.status !== 207) {
      throw new Error(
        `CalDAV request failed: ${response.status} ${response.statusText}`,
      );
    }

    return response;
  }

  /**
   * Discover the calendar URL using PROPFIND
   */
  async discover(): Promise<string> {
    if (this.config.calendarPath) {
      this.calendarUrl = `${this.config.url}${this.config.calendarPath}`;
      return this.calendarUrl;
    }

    // Use current-user-principal to find calendar home
    const propfind = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`;

    const response = await this.request("PROPFIND", this.config.url, propfind, {
      Depth: "0",
    });

    const text = await response.text();
    // Parse response to find principal URL
    const principalMatch = text.match(/<D:href>([^<]+)<\/D:href>/);
    if (principalMatch) {
      const principalUrl = principalMatch[1];
      // Then find calendar-home-set
      const homeResponse = await this.request(
        "PROPFIND",
        `${this.config.url}${principalUrl}`,
        `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>`,
        { Depth: "0" },
      );

      const homeText = await homeResponse.text();
      const homeMatch = homeText.match(
        /<C:calendar-home-set>.*?<D:href>([^<]+)<\/D:href>/s,
      );
      if (homeMatch) {
        this.calendarUrl = `${this.config.url}${homeMatch[1]}`;
        return this.calendarUrl;
      }
    }

    // Fallback: use the config URL directly
    this.calendarUrl = this.config.url;
    return this.calendarUrl;
  }

  /**
   * Get all calendar events
   */
  async getEvents(): Promise<CalendarEvent[]> {
    if (!this.calendarUrl) {
      await this.discover();
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
</C:calendar-query>`;

    const response = await this.request(
      "REPORT",
      this.calendarUrl ?? "",
      report,
      {
        Depth: "1",
      },
    );

    const text = await response.text();
    const events: CalendarEvent[] = [];

    // Parse multiget response
    const responseRegex =
      /<D:response>[\s\S]*?<D:href>([^<]+)<\/D:href>[\s\S]*?<D:getetag>"?([^"<]+)"?<\/D:getetag>[\s\S]*?<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data>[\s\S]*?<\/D:response>/g;

    let match;
    while ((match = responseRegex.exec(text)) !== null) {
      const etag = match[2];
      const icalData = match[3]
        ?.replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      if (icalData) {
        const event = parseICalendar(icalData);
        if (event) {
          event.etag = etag;
          event.raw = icalData;
          events.push(event);
        }
      }
    }

    return events;
  }

  /**
   * Create a new calendar event
   */
  async createEvent(event: CalendarEvent): Promise<void> {
    if (!this.calendarUrl) {
      await this.discover();
    }

    const ical = formatICalendar(event);
    const url = `${this.calendarUrl}/${event.uid}.ics`;

    await this.request("PUT", url, ical, {
      "Content-Type": "text/calendar; charset=utf-8",
      "If-None-Match": "*", // Only create if doesn't exist
    });
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(event: CalendarEvent): Promise<void> {
    if (!this.calendarUrl) {
      await this.discover();
    }

    const ical = formatICalendar(event);
    const url = `${this.calendarUrl}/${event.uid}.ics`;

    const headers: Record<string, string> = {
      "Content-Type": "text/calendar; charset=utf-8",
    };
    if (event.etag) {
      headers["If-Match"] = event.etag;
    }

    await this.request("PUT", url, ical, headers);
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(uid: string, etag?: string): Promise<void> {
    if (!this.calendarUrl) {
      await this.discover();
    }

    const url = `${this.calendarUrl}/${uid}.ics`;
    const headers: Record<string, string> = {};
    if (etag) {
      headers["If-Match"] = etag;
    }

    await this.request("DELETE", url, undefined, headers);
  }

  /**
   * Sync calendar using WebDAV sync (RFC 6578)
   */
  async sync(state?: SyncState): Promise<SyncResult> {
    if (!this.calendarUrl) {
      await this.discover();
    }

    const result: SyncResult = {
      added: [],
      modified: [],
      deleted: [],
      state: state || { etags: {} },
    };

    if (state?.syncToken) {
      // Incremental sync using sync-collection
      const syncReport = `<?xml version="1.0" encoding="utf-8"?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token>${state.syncToken}</D:sync-token>
  <D:sync-level>1</D:sync-level>
  <D:prop>
    <D:getetag/>
  </D:prop>
</D:sync-collection>`;

      const response = await this.request(
        "REPORT",
        this.calendarUrl ?? "",
        syncReport,
      );
      const text = await response.text();

      // Parse sync response
      const newSyncToken = text.match(
        /<D:sync-token>([^<]+)<\/D:sync-token>/,
      )?.[1];
      if (newSyncToken) {
        result.state.syncToken = newSyncToken;
      }

      // Process changes
      const changeRegex =
        /<D:response>[\s\S]*?<D:href>([^<]+)<\/D:href>[\s\S]*?(?:<D:getetag>"?([^"<]+)"?<\/D:getetag>)?[\s\S]*?(?:<D:status>HTTP\/1\.1 (\d+)[^<]*<\/D:status>)?[\s\S]*?<\/D:response>/g;

      let match;
      while ((match = changeRegex.exec(text)) !== null) {
        const href = match[1];
        const etag = match[2];
        const status = match[3];

        const uid = href?.match(/([^/]+)\.ics$/)?.[1];
        if (!uid) continue;

        if (status === "404" || !etag) {
          // Deleted
          result.deleted.push(uid);
          delete result.state.etags[uid];
        } else if (state.etags[uid]) {
          if (state.etags[uid] !== etag) {
            // Modified
            result.modified.push(uid);
            result.state.etags[uid] = etag;
          }
        } else {
          // Added
          result.added.push(uid);
          result.state.etags[uid] = etag;
        }
      }
    } else {
      // Full sync - get all events and compare
      const events = await this.getEvents();
      const newEtags: Record<string, string> = {};

      for (const event of events) {
        newEtags[event.uid] = event.etag || "";

        if (state?.etags[event.uid]) {
          if (state.etags[event.uid] !== event.etag) {
            result.modified.push(event.uid);
          }
        } else {
          result.added.push(event.uid);
        }
      }

      // Find deleted
      if (state?.etags) {
        for (const uid of Object.keys(state.etags)) {
          if (!newEtags[uid]) {
            result.deleted.push(uid);
          }
        }
      }

      result.state.etags = newEtags;
      result.state.lastSync = Date.now();
    }

    return result;
  }
}
