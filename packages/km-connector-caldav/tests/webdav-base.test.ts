/**
 * WebDAV Base Tests
 *
 * Tests for the shared WebDAV functionality.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  createBasicAuthHeader,
  webdavRequest,
  discoverPrincipal,
} from "../src/webdav-base.ts";

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

function mockResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}

describe("webdav-base", () => {
  describe("createBasicAuthHeader", () => {
    test("creates valid Basic Auth header", () => {
      const header = createBasicAuthHeader("user", "password");

      expect(header).toMatch(/^Basic /);
      // Decode and verify
      const encoded = header.replace("Basic ", "");
      const decoded = Buffer.from(encoded, "base64").toString();
      expect(decoded).toBe("user:password");
    });

    test("handles special characters in credentials", () => {
      const header = createBasicAuthHeader("user@example.com", "p@ss:word!");

      const encoded = header.replace("Basic ", "");
      const decoded = Buffer.from(encoded, "base64").toString();
      expect(decoded).toBe("user@example.com:p@ss:word!");
    });

    test("handles empty password", () => {
      const header = createBasicAuthHeader("user", "");

      const encoded = header.replace("Basic ", "");
      const decoded = Buffer.from(encoded, "base64").toString();
      expect(decoded).toBe("user:");
    });
  });

  describe("webdavRequest", () => {
    beforeEach(() => {
      setupMockFetch();
    });

    afterEach(() => {
      restoreFetch();
    });

    test("sends request with correct headers", async () => {
      const capturedOptions: RequestInit[] = [];
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedOptions.push(options ?? {});
        return Promise.resolve(mockResponse("", 200));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");
      await webdavRequest("PROPFIND", "https://example.com/dav", authHeader);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(capturedOptions[0].method).toBe("PROPFIND");
      expect(capturedOptions[0].headers).toMatchObject({
        Authorization: authHeader,
        "Content-Type": "application/xml; charset=utf-8",
      });
    });

    test("sends request body when provided", async () => {
      const capturedOptions: RequestInit[] = [];
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedOptions.push(options ?? {});
        return Promise.resolve(mockResponse("", 207));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");
      const body = '<?xml version="1.0"?><D:propfind/>';
      await webdavRequest(
        "PROPFIND",
        "https://example.com/dav",
        authHeader,
        body,
      );

      expect(capturedOptions[0].body).toBe(body);
    });

    test("includes custom headers", async () => {
      const capturedOptions: RequestInit[] = [];
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedOptions.push(options ?? {});
        return Promise.resolve(mockResponse("", 207));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");
      await webdavRequest(
        "PROPFIND",
        "https://example.com/dav",
        authHeader,
        undefined,
        { Depth: "1", "X-Custom": "value" },
      );

      const headers = capturedOptions[0].headers as Record<string, string>;
      expect(headers.Depth).toBe("1");
      expect(headers["X-Custom"]).toBe("value");
    });

    test("accepts 207 Multi-Status response", async () => {
      mockFetch = mock(() =>
        Promise.resolve(mockResponse("<D:multistatus/>", 207)),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");
      const response = await webdavRequest(
        "PROPFIND",
        "https://example.com/dav",
        authHeader,
      );

      expect(response.status).toBe(207);
    });

    test("throws on error status", async () => {
      mockFetch = mock(() =>
        Promise.resolve(new Response("Unauthorized", { status: 401 })),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "wrong");

      await expect(
        webdavRequest("PROPFIND", "https://example.com/dav", authHeader),
      ).rejects.toThrow("WebDAV request failed: 401");
    });

    test("throws on 404 Not Found", async () => {
      mockFetch = mock(() =>
        Promise.resolve(new Response("Not Found", { status: 404 })),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");

      await expect(
        webdavRequest("GET", "https://example.com/missing", authHeader),
      ).rejects.toThrow("WebDAV request failed: 404");
    });
  });

  describe("discoverPrincipal", () => {
    beforeEach(() => {
      setupMockFetch();
    });

    afterEach(() => {
      restoreFetch();
    });

    test("extracts first href from response (used for principal discovery)", async () => {
      // Note: discoverPrincipal uses a simple regex that matches the first D:href
      // The actual CalDAV/CardDAV clients use this as a starting point for discovery
      mockFetch = mock(() =>
        Promise.resolve(
          mockResponse(
            `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/principals/users/john/</D:href>
    <D:propstat>
      <D:prop>
        <D:current-user-principal>
          <D:href>/principals/users/john/</D:href>
        </D:current-user-principal>
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`,
            207,
          ),
        ),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");
      const result = await discoverPrincipal(
        "https://example.com/dav",
        authHeader,
      );

      expect(result).toBe("/principals/users/john/");
    });

    test("returns first href even without current-user-principal", async () => {
      // The function returns the first D:href it finds
      mockFetch = mock(() =>
        Promise.resolve(
          mockResponse(
            `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/some/path/</D:href>
    <D:propstat>
      <D:prop/>
    </D:propstat>
  </D:response>
</D:multistatus>`,
            207,
          ),
        ),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");
      const result = await discoverPrincipal(
        "https://example.com/dav",
        authHeader,
      );

      expect(result).toBe("/some/path/");
    });

    test("returns null when no href found", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          mockResponse(
            `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
</D:multistatus>`,
            207,
          ),
        ),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");
      const result = await discoverPrincipal(
        "https://example.com/dav",
        authHeader,
      );

      expect(result).toBeNull();
    });

    test("sends PROPFIND with Depth 0", async () => {
      const capturedOptions: RequestInit[] = [];
      mockFetch = mock((url: string, options?: RequestInit) => {
        capturedOptions.push(options ?? {});
        return Promise.resolve(mockResponse("<D:multistatus/>", 207));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const authHeader = createBasicAuthHeader("user", "pass");
      await discoverPrincipal("https://example.com/dav", authHeader);

      expect(capturedOptions[0].method).toBe("PROPFIND");
      const headers = capturedOptions[0].headers as Record<string, string>;
      expect(headers.Depth).toBe("0");
    });
  });
});
