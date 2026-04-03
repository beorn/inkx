/**
 * Content-Addressable Store Tests
 *
 * Tests for cas.ts functions.
 */

import { describe, test, expect } from "vitest"
import { existsSync } from "fs"
import { join } from "path"
import {
  getBlobsPath,
  hashContent,
  storeContent,
  loadContent,
  hasContent,
  shouldStoreInCas,
  storeContentAuto,
  loadContentAuto,
} from "../src/fs/cas.ts"
import { withTestEnvSync } from "@km/storage"

describe("cas.ts", () => {
  describe("getBlobsPath", () => {
    test("returns path to blobs directory", () =>
      withTestEnvSync(({ kmDir }) => {
        const path = getBlobsPath(kmDir)
        expect(path).toBe(join(kmDir, "blobs"))
      }))
  })

  describe("hashContent", () => {
    test("returns SHA-256 hash of content", () => {
      const hash = hashContent("hello world")
      // Known SHA-256 hash of "hello world"
      expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
    })

    test("different content produces different hashes", () => {
      const hash1 = hashContent("content 1")
      const hash2 = hashContent("content 2")
      expect(hash1).not.toBe(hash2)
    })

    test("same content produces same hash", () => {
      const hash1 = hashContent("same content")
      const hash2 = hashContent("same content")
      expect(hash1).toBe(hash2)
    })
  })

  describe("storeContent / loadContent", () => {
    test("stores and retrieves content by hash", () =>
      withTestEnvSync(({ kmDir }) => {
        const content = "test content to store"
        const hash = storeContent(kmDir, content)

        const retrieved = loadContent(kmDir, hash)
        expect(retrieved).toBe(content)
      }))

    test("creates sharded directory structure", () =>
      withTestEnvSync(({ kmDir }) => {
        const content = "test content"
        const hash = storeContent(kmDir, content)

        // Hash should be stored at blobs/XX/rest-of-hash
        const prefix = hash.slice(0, 2)
        const blobDir = join(getBlobsPath(kmDir), prefix)
        expect(existsSync(blobDir)).toBe(true)
      }))

    test("deduplicates identical content", () =>
      withTestEnvSync(({ kmDir }) => {
        const content = "duplicate content"
        const hash1 = storeContent(kmDir, content)
        const hash2 = storeContent(kmDir, content)

        expect(hash1).toBe(hash2)
      }))

    test("loadContent returns null for non-existent hash", () =>
      withTestEnvSync(({ kmDir }) => {
        const result = loadContent(kmDir, "0000000000000000000000000000000000000000000000000000000000000000")
        expect(result).toBeNull()
      }))
  })

  describe("hasContent", () => {
    test("returns true when content exists", () =>
      withTestEnvSync(({ kmDir }) => {
        const content = "stored content"
        const hash = storeContent(kmDir, content)

        expect(hasContent(kmDir, hash)).toBe(true)
      }))

    test("returns false when content doesn't exist", () =>
      withTestEnvSync(({ kmDir }) => {
        expect(hasContent(kmDir, "0000000000000000000000000000000000000000000000000000000000000000")).toBe(false)
      }))
  })

  describe("shouldStoreInCas", () => {
    test("returns false for small content", () => {
      const smallContent = "small"
      expect(shouldStoreInCas(smallContent)).toBe(false)
    })

    test("returns true for large content (>4KB)", () => {
      const largeContent = "x".repeat(5000)
      expect(shouldStoreInCas(largeContent)).toBe(true)
    })

    test("handles exactly threshold size", () => {
      const exactContent = "x".repeat(4096)
      expect(shouldStoreInCas(exactContent)).toBe(false)

      const overContent = "x".repeat(4097)
      expect(shouldStoreInCas(overContent)).toBe(true)
    })
  })

  describe("storeContentAuto", () => {
    test("stores small content inline", () =>
      withTestEnvSync(({ kmDir }) => {
        const smallContent = "small content"
        const result = storeContentAuto(kmDir, smallContent)

        expect(result.content).toBe(smallContent)
        expect(result.content_hash).toBeNull()
      }))

    test("stores large content in CAS", () =>
      withTestEnvSync(({ kmDir }) => {
        const largeContent = "x".repeat(5000)
        const result = storeContentAuto(kmDir, largeContent)

        expect(result.content).toBeNull()
        expect(result.content_hash).not.toBeNull()
        expect(typeof result.content_hash).toBe("string")
      }))
  })

  describe("loadContentAuto", () => {
    test("returns inline content when available", () =>
      withTestEnvSync(({ kmDir }) => {
        const content = "inline content"
        const result = loadContentAuto(kmDir, content, null)
        expect(result).toBe(content)
      }))

    test("loads from CAS when hash provided", () =>
      withTestEnvSync(({ kmDir }) => {
        const content = "cas content"
        const hash = storeContent(kmDir, content)

        const result = loadContentAuto(kmDir, null, hash)
        expect(result).toBe(content)
      }))

    test("prefers inline content over hash", () =>
      withTestEnvSync(({ kmDir }) => {
        const inlineContent = "inline"
        const casContent = "from cas"
        const hash = storeContent(kmDir, casContent)

        const result = loadContentAuto(kmDir, inlineContent, hash)
        expect(result).toBe(inlineContent)
      }))

    test("returns null when neither available", () =>
      withTestEnvSync(({ kmDir }) => {
        const result = loadContentAuto(kmDir, null, null)
        expect(result).toBeNull()
      }))

    test("handles undefined values", () =>
      withTestEnvSync(({ kmDir }) => {
        const result = loadContentAuto(kmDir, undefined, undefined)
        expect(result).toBeNull()
      }))
  })
})
