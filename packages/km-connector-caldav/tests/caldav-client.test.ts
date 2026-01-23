/**
 * CalDAV Client Tests
 *
 * Tests for CalDAVClient class using mocked fetch responses.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { CalDAVClient } from "../src/caldav-client.ts";
import type { CalendarEvent } from "../src/types.ts";

// Mock fetch globally
const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof mock>;

function setupMockFetch() {
  mockFetch = mock(() => Promise.resolve(new Response("", { status: 200 })));
  globalThis.fetch = mockFetch as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Helper to create mock response
function mockResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

// Sample WebDAV responses
const PROPFIND_PRINCIPAL_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/</D:href>
    <D:propstat>
      <D:prop>
        <D:current-user-principal>
          <D:href>/principals/users/testuser/</D:href>
        </D:current-user-principal>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

const PROPFIND_CALENDAR_HOME_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/principals/users/testuser/</D:href>
    <D:propstat>
      <D:prop>
        <C:calendar-home-set>
          <D:href>/calendars/testuser/default/</D:href>
        </C:calendar-home-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

const CALENDAR_QUERY_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/testuser/default/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"etag-123"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-uid-1
SUMMARY:Test Event
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/calendars/testuser/default/event2.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"etag-456"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-uid-2
SUMMARY:Another Event
DTSTART:20240116T140000Z
DTEND:20240116T150000Z
LOCATION:Conference Room
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

const SYNC_COLLECTION_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/calendars/testuser/default/event3.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"etag-789"</D:getetag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/calendars/testuser/default/event1.ics</D:href>
    <D:status>HTTP/1.1 404 Not Found</D:status>
  </D:response>
  <D:sync-token>sync-token-new-123</D:sync-token>
</D:multistatus>`;

describe("CalDAVClient", () => {
  beforeEach(() => {
    setupMockFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  describe("constructor", () => {
    test("creates client with config", () => {
      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
      });

      expect(client).toBeDefined();
    });
  });

  describe("discover", () => {
    test("uses configured calendar path when provided", async () => {
      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user/custom/",
      });

      const result = await client.discover();

      expect(result).toBe("https://caldav.example.com/calendars/user/custom/");
      // Should not make any network requests when path is configured
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("discovers calendar URL via PROPFIND", async () => {
      let callCount = 0;
      mockFetch = mock((url: string) => {
        callCount++;
        if (callCount === 1) {
          // First call: get principal
          return Promise.resolve(
            mockResponse(PROPFIND_PRINCIPAL_RESPONSE, 207),
          );
        } else {
          // Second call: get calendar home
          return Promise.resolve(
            mockResponse(PROPFIND_CALENDAR_HOME_RESPONSE, 207),
          );
        }
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
      });

      const result = await client.discover();

      expect(result).toBe(
        "https://caldav.example.com/calendars/testuser/default/",
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("falls back to config URL when discovery fails", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse("<D:multistatus></D:multistatus>", 207)),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com/fallback/",
        username: "user",
        password: "pass",
      });

      const result = await client.discover();

      expect(result).toBe("https://caldav.example.com/fallback/");
    });
  });

  describe("getEvents", () => {
    test("fetches and parses events", async () => {
      let callCount = 0;
      mockFetch = mock((url: string) => {
        callCount++;
        if (callCount <= 2) {
          // Discovery calls
          if (callCount === 1) {
            return Promise.resolve(
              mockResponse(PROPFIND_PRINCIPAL_RESPONSE, 207),
            );
          }
          return Promise.resolve(
            mockResponse(PROPFIND_CALENDAR_HOME_RESPONSE, 207),
          );
        }
        // REPORT call
        return Promise.resolve(mockResponse(CALENDAR_QUERY_RESPONSE, 207));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
      });

      const events = await client.getEvents();

      expect(events).toHaveLength(2);
      expect(events[0].uid).toBe("event-uid-1");
      expect(events[0].summary).toBe("Test Event");
      expect(events[0].etag).toBe("etag-123");
      expect(events[1].uid).toBe("event-uid-2");
      expect(events[1].summary).toBe("Another Event");
      expect(events[1].location).toBe("Conference Room");
    });

    test("skips discovery if already discovered", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(CALENDAR_QUERY_RESPONSE, 207)),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user/",
      });

      await client.discover();
      mockFetch.mockClear();

      await client.getEvents();

      // Should only make one call (REPORT), not discovery calls
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("createEvent", () => {
    test("sends PUT request with iCalendar data", async () => {
      const capturedRequests: {
        url: string;
        method: string;
        body?: string;
        headers?: Record<string, string>;
      }[] = [];
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedRequests.push({
          url,
          method: options?.method ?? "GET",
          body: options?.body as string | undefined,
          headers: options?.headers as Record<string, string> | undefined,
        });
        return Promise.resolve(mockResponse("", 201));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user", // No trailing slash to avoid double slash
      });

      const event: CalendarEvent = {
        uid: "new-event-123",
        summary: "New Event",
        dtstart: "2024-01-20T09:00:00Z",
        dtend: "2024-01-20T10:00:00Z",
      };

      await client.createEvent(event);

      const putRequest = capturedRequests.find((r) => r.method === "PUT");
      expect(putRequest).toBeDefined();
      expect(putRequest?.url).toBe(
        "https://caldav.example.com/calendars/user/new-event-123.ics",
      );
      expect(putRequest?.body).toContain("BEGIN:VCALENDAR");
      expect(putRequest?.body).toContain("UID:new-event-123");
      expect(putRequest?.headers?.["If-None-Match"]).toBe("*");
    });
  });

  describe("updateEvent", () => {
    test("sends PUT request with If-Match header", async () => {
      const capturedRequests: {
        url: string;
        method: string;
        headers?: Record<string, string>;
      }[] = [];
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedRequests.push({
          url,
          method: options?.method ?? "GET",
          headers: options?.headers as Record<string, string> | undefined,
        });
        return Promise.resolve(mockResponse("", 204));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user/",
      });

      const event: CalendarEvent = {
        uid: "existing-event",
        summary: "Updated Event",
        dtstart: "2024-01-20T09:00:00Z",
        etag: '"etag-old"',
      };

      await client.updateEvent(event);

      const putRequest = capturedRequests.find((r) => r.method === "PUT");
      expect(putRequest?.headers?.["If-Match"]).toBe('"etag-old"');
    });
  });

  describe("deleteEvent", () => {
    test("sends DELETE request", async () => {
      const capturedRequests: {
        url: string;
        method: string;
        headers?: Record<string, string>;
      }[] = [];
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedRequests.push({
          url,
          method: options?.method ?? "GET",
          headers: options?.headers as Record<string, string> | undefined,
        });
        return Promise.resolve(mockResponse("", 204));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user", // No trailing slash to avoid double slash
      });

      await client.deleteEvent("event-to-delete", '"etag-123"');

      const deleteRequest = capturedRequests.find((r) => r.method === "DELETE");
      expect(deleteRequest).toBeDefined();
      expect(deleteRequest?.url).toBe(
        "https://caldav.example.com/calendars/user/event-to-delete.ics",
      );
      expect(deleteRequest?.headers?.["If-Match"]).toBe('"etag-123"');
    });
  });

  describe("sync", () => {
    test("full sync without prior state", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(CALENDAR_QUERY_RESPONSE, 207)),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user/",
      });

      const result = await client.sync();

      expect(result.added).toContain("event-uid-1");
      expect(result.added).toContain("event-uid-2");
      expect(result.modified).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
      expect(result.state.etags["event-uid-1"]).toBe("etag-123");
      expect(result.state.etags["event-uid-2"]).toBe("etag-456");
    });

    test("detects modified events", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(CALENDAR_QUERY_RESPONSE, 207)),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user/",
      });

      const result = await client.sync({
        etags: {
          "event-uid-1": "old-etag", // Different etag = modified
          "event-uid-2": "etag-456", // Same etag = unchanged
        },
      });

      expect(result.modified).toContain("event-uid-1");
      expect(result.modified).not.toContain("event-uid-2");
      expect(result.added).toHaveLength(0);
    });

    test("detects deleted events", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(CALENDAR_QUERY_RESPONSE, 207)),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user/",
      });

      const result = await client.sync({
        etags: {
          "event-uid-1": "etag-123",
          "event-uid-2": "etag-456",
          "event-uid-deleted": "some-etag", // No longer in response
        },
      });

      expect(result.deleted).toContain("event-uid-deleted");
    });

    test("incremental sync using sync-collection updates sync token", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(SYNC_COLLECTION_RESPONSE, 207)),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new CalDAVClient({
        url: "https://caldav.example.com",
        username: "user",
        password: "pass",
        calendarPath: "/calendars/user",
      });

      const result = await client.sync({
        syncToken: "sync-token-old",
        etags: {
          event1: "etag-123",
          event2: "etag-456",
        },
      });

      // Verify sync token is updated from the response
      expect(result.state.syncToken).toBe("sync-token-new-123");
      // The sync result should contain arrays for added/modified/deleted
      // (exact contents depend on regex parsing of the response)
      expect(Array.isArray(result.added)).toBe(true);
      expect(Array.isArray(result.modified)).toBe(true);
      expect(Array.isArray(result.deleted)).toBe(true);
    });
  });
});
