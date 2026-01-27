/**
 * CardDAV Client Tests
 *
 * Tests for CardDAVClient class using mocked fetch responses.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "vitest"
import { CardDAVClient } from "../src/carddav-client.ts"
import type { Contact } from "../src/types.ts"

// Mock fetch globally
const originalFetch = globalThis.fetch
let mockFetch: ReturnType<typeof mock>

function setupMockFetch() {
  mockFetch = mock(() => Promise.resolve(new Response("", { status: 200 })))
  globalThis.fetch = mockFetch as unknown as typeof fetch
}

function restoreFetch() {
  globalThis.fetch = originalFetch
}

// Helper to create mock response
function mockResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/xml" },
  })
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
</D:multistatus>`

const PROPFIND_ADDRESSBOOK_HOME_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:response>
    <D:href>/principals/users/testuser/</D:href>
    <D:propstat>
      <D:prop>
        <C:addressbook-home-set>
          <D:href>/addressbooks/testuser/default/</D:href>
        </C:addressbook-home-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`

const ADDRESSBOOK_QUERY_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:response>
    <D:href>/addressbooks/testuser/default/contact1.vcf</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"etag-abc"</D:getetag>
        <C:address-data>BEGIN:VCARD
VERSION:3.0
UID:contact-uid-1
FN:John Doe
N:Doe;John;;;
EMAIL;TYPE=WORK:john@example.com
TEL;TYPE=CELL:+1234567890
END:VCARD</C:address-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/addressbooks/testuser/default/contact2.vcf</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"etag-def"</D:getetag>
        <C:address-data>BEGIN:VCARD
VERSION:3.0
UID:contact-uid-2
FN:Jane Smith
N:Smith;Jane;;;
EMAIL;TYPE=HOME:jane@example.org
ORG:Acme Inc
TITLE:Software Engineer
END:VCARD</C:address-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`

describe("CardDAVClient", () => {
  beforeEach(() => {
    setupMockFetch()
  })

  afterEach(() => {
    restoreFetch()
  })

  describe("constructor", () => {
    test("creates client with config", () => {
      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
      })

      expect(client).toBeDefined()
    })
  })

  describe("discover", () => {
    test("uses configured addressbook path when provided", async () => {
      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
        addressBookPath: "/addressbooks/user/contacts/",
      })

      const result = await client.discover()

      expect(result).toBe(
        "https://carddav.example.com/addressbooks/user/contacts/",
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test("discovers addressbook URL via PROPFIND", async () => {
      let callCount = 0
      mockFetch = mock((url: string) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(mockResponse(PROPFIND_PRINCIPAL_RESPONSE, 207))
        } else {
          return Promise.resolve(
            mockResponse(PROPFIND_ADDRESSBOOK_HOME_RESPONSE, 207),
          )
        }
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
      })

      const result = await client.discover()

      expect(result).toBe(
        "https://carddav.example.com/addressbooks/testuser/default/",
      )
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    test("falls back to config URL when discovery fails", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse("<D:multistatus></D:multistatus>", 207)),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com/fallback/",
        username: "user",
        password: "pass",
      })

      const result = await client.discover()

      expect(result).toBe("https://carddav.example.com/fallback/")
    })
  })

  describe("getContacts", () => {
    test("fetches and parses contacts", async () => {
      let callCount = 0
      mockFetch = mock((url: string) => {
        callCount++
        if (callCount <= 2) {
          if (callCount === 1) {
            return Promise.resolve(
              mockResponse(PROPFIND_PRINCIPAL_RESPONSE, 207),
            )
          }
          return Promise.resolve(
            mockResponse(PROPFIND_ADDRESSBOOK_HOME_RESPONSE, 207),
          )
        }
        return Promise.resolve(mockResponse(ADDRESSBOOK_QUERY_RESPONSE, 207))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
      })

      const contacts = await client.getContacts()

      expect(contacts).toHaveLength(2)
      expect(contacts[0]!.uid).toBe("contact-uid-1")
      expect(contacts[0]!.fullName).toBe("John Doe")
      expect(contacts[0]!.etag).toBe("etag-abc")
      expect(contacts[0]!.emails?.[0]!.value).toBe("john@example.com")
      expect(contacts[0]!.phones?.[0]!.value).toBe("+1234567890")

      expect(contacts[1]!.uid).toBe("contact-uid-2")
      expect(contacts[1]!.fullName).toBe("Jane Smith")
      expect(contacts[1]!.org).toBe("Acme Inc")
      expect(contacts[1]!.title).toBe("Software Engineer")
    })

    test("skips discovery if already discovered", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(ADDRESSBOOK_QUERY_RESPONSE, 207)),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
        addressBookPath: "/addressbooks/user/",
      })

      await client.discover()
      mockFetch.mockClear()

      await client.getContacts()

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe("createContact", () => {
    test("sends PUT request with vCard data", async () => {
      const capturedRequests: {
        url: string
        method: string
        body?: string
        headers?: Record<string, string>
      }[] = []
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedRequests.push({
          url,
          method: options?.method ?? "GET",
          body: options?.body as string | undefined,
          headers: options?.headers as Record<string, string> | undefined,
        })
        return Promise.resolve(mockResponse("", 201))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
        addressBookPath: "/addressbooks/user", // No trailing slash to avoid double slash
      })

      const contact: Contact = {
        uid: "new-contact-123",
        fullName: "New Contact",
        emails: [{ type: "work", value: "new@example.com" }],
      }

      await client.createContact(contact)

      const putRequest = capturedRequests.find((r) => r.method === "PUT")
      expect(putRequest).toBeDefined()
      expect(putRequest?.url).toBe(
        "https://carddav.example.com/addressbooks/user/new-contact-123.vcf",
      )
      expect(putRequest?.body).toContain("BEGIN:VCARD")
      expect(putRequest?.body).toContain("UID:new-contact-123")
      expect(putRequest?.body).toContain("FN:New Contact")
      expect(putRequest?.headers?.["If-None-Match"]).toBe("*")
    })
  })

  describe("updateContact", () => {
    test("sends PUT request with If-Match header", async () => {
      const capturedRequests: {
        url: string
        method: string
        headers?: Record<string, string>
      }[] = []
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedRequests.push({
          url,
          method: options?.method ?? "GET",
          headers: options?.headers as Record<string, string> | undefined,
        })
        return Promise.resolve(mockResponse("", 204))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
        addressBookPath: "/addressbooks/user/",
      })

      const contact: Contact = {
        uid: "existing-contact",
        fullName: "Updated Contact",
        etag: '"etag-old"',
      }

      await client.updateContact(contact)

      const putRequest = capturedRequests.find((r) => r.method === "PUT")
      expect(putRequest?.headers?.["If-Match"]).toBe('"etag-old"')
    })
  })

  describe("deleteContact", () => {
    test("sends DELETE request", async () => {
      const capturedRequests: {
        url: string
        method: string
        headers?: Record<string, string>
      }[] = []
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedRequests.push({
          url,
          method: options?.method ?? "GET",
          headers: options?.headers as Record<string, string> | undefined,
        })
        return Promise.resolve(mockResponse("", 204))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
        addressBookPath: "/addressbooks/user", // No trailing slash to avoid double slash
      })

      await client.deleteContact("contact-to-delete", '"etag-123"')

      const deleteRequest = capturedRequests.find((r) => r.method === "DELETE")
      expect(deleteRequest).toBeDefined()
      expect(deleteRequest?.url).toBe(
        "https://carddav.example.com/addressbooks/user/contact-to-delete.vcf",
      )
      expect(deleteRequest?.headers?.["If-Match"]).toBe('"etag-123"')
    })
  })

  describe("sync", () => {
    test("full sync without prior state", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(ADDRESSBOOK_QUERY_RESPONSE, 207)),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
        addressBookPath: "/addressbooks/user/",
      })

      const result = await client.sync()

      expect(result.added).toContain("contact-uid-1")
      expect(result.added).toContain("contact-uid-2")
      expect(result.modified).toHaveLength(0)
      expect(result.deleted).toHaveLength(0)
      expect(result.state.etags["contact-uid-1"]).toBe("etag-abc")
      expect(result.state.etags["contact-uid-2"]).toBe("etag-def")
      expect(result.state.lastSync).toBeDefined()
    })

    test("detects modified contacts", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(ADDRESSBOOK_QUERY_RESPONSE, 207)),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
        addressBookPath: "/addressbooks/user/",
      })

      const result = await client.sync({
        etags: {
          "contact-uid-1": "old-etag", // Different etag = modified
          "contact-uid-2": "etag-def", // Same etag = unchanged
        },
      })

      expect(result.modified).toContain("contact-uid-1")
      expect(result.modified).not.toContain("contact-uid-2")
      expect(result.added).toHaveLength(0)
    })

    test("detects deleted contacts", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse(ADDRESSBOOK_QUERY_RESPONSE, 207)),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new CardDAVClient({
        url: "https://carddav.example.com",
        username: "user",
        password: "pass",
        addressBookPath: "/addressbooks/user/",
      })

      const result = await client.sync({
        etags: {
          "contact-uid-1": "etag-abc",
          "contact-uid-2": "etag-def",
          "contact-uid-deleted": "some-etag", // No longer in response
        },
      })

      expect(result.deleted).toContain("contact-uid-deleted")
    })
  })
})
