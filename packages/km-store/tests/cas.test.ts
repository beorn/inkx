/**
 * Content-Addressable Store Tests
 *
 * Tests for cas.ts functions.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { setKmDir } from "@km/core";
import {
  getBlobsPath,
  hashContent,
  storeContent,
  loadContent,
  hasContent,
  shouldStoreInCas,
  storeContentAuto,
  loadContentAuto,
} from "../src/cas.ts";

const TEST_DIR = join(import.meta.dir, ".test-cas");
const KM_DIR = join(TEST_DIR, ".km");

describe("cas.ts", () => {
  beforeEach(() => {
    // Clean up and create test directory structure
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(KM_DIR, { recursive: true });
    setKmDir(KM_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("getBlobsPath", () => {
    test("returns path to blobs directory", () => {
      const path = getBlobsPath();
      expect(path).toBe(join(KM_DIR, "blobs"));
    });
  });

  describe("hashContent", () => {
    test("returns SHA-256 hash of content", () => {
      const hash = hashContent("hello world");
      // Known SHA-256 hash of "hello world"
      expect(hash).toBe(
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      );
    });

    test("different content produces different hashes", () => {
      const hash1 = hashContent("content 1");
      const hash2 = hashContent("content 2");
      expect(hash1).not.toBe(hash2);
    });

    test("same content produces same hash", () => {
      const hash1 = hashContent("same content");
      const hash2 = hashContent("same content");
      expect(hash1).toBe(hash2);
    });
  });

  describe("storeContent / loadContent", () => {
    test("stores and retrieves content by hash", () => {
      const content = "test content to store";
      const hash = storeContent(content);

      const retrieved = loadContent(hash);
      expect(retrieved).toBe(content);
    });

    test("creates sharded directory structure", () => {
      const content = "test content";
      const hash = storeContent(content);

      // Hash should be stored at blobs/XX/rest-of-hash
      const prefix = hash.slice(0, 2);
      const blobDir = join(getBlobsPath(), prefix);
      expect(existsSync(blobDir)).toBe(true);
    });

    test("deduplicates identical content", () => {
      const content = "duplicate content";
      const hash1 = storeContent(content);
      const hash2 = storeContent(content);

      expect(hash1).toBe(hash2);
    });

    test("loadContent returns null for non-existent hash", () => {
      const result = loadContent(
        "0000000000000000000000000000000000000000000000000000000000000000",
      );
      expect(result).toBeNull();
    });
  });

  describe("hasContent", () => {
    test("returns true when content exists", () => {
      const content = "stored content";
      const hash = storeContent(content);

      expect(hasContent(hash)).toBe(true);
    });

    test("returns false when content doesn't exist", () => {
      expect(
        hasContent(
          "0000000000000000000000000000000000000000000000000000000000000000",
        ),
      ).toBe(false);
    });
  });

  describe("shouldStoreInCas", () => {
    test("returns false for small content", () => {
      const smallContent = "small";
      expect(shouldStoreInCas(smallContent)).toBe(false);
    });

    test("returns true for large content (>4KB)", () => {
      const largeContent = "x".repeat(5000);
      expect(shouldStoreInCas(largeContent)).toBe(true);
    });

    test("handles exactly threshold size", () => {
      const exactContent = "x".repeat(4096);
      expect(shouldStoreInCas(exactContent)).toBe(false);

      const overContent = "x".repeat(4097);
      expect(shouldStoreInCas(overContent)).toBe(true);
    });
  });

  describe("storeContentAuto", () => {
    test("stores small content inline", () => {
      const smallContent = "small content";
      const result = storeContentAuto(smallContent);

      expect(result.content).toBe(smallContent);
      expect(result.content_hash).toBeNull();
    });

    test("stores large content in CAS", () => {
      const largeContent = "x".repeat(5000);
      const result = storeContentAuto(largeContent);

      expect(result.content).toBeNull();
      expect(result.content_hash).not.toBeNull();
      expect(typeof result.content_hash).toBe("string");
    });
  });

  describe("loadContentAuto", () => {
    test("returns inline content when available", () => {
      const content = "inline content";
      const result = loadContentAuto(content, null);
      expect(result).toBe(content);
    });

    test("loads from CAS when hash provided", () => {
      const content = "cas content";
      const hash = storeContent(content);

      const result = loadContentAuto(null, hash);
      expect(result).toBe(content);
    });

    test("prefers inline content over hash", () => {
      const inlineContent = "inline";
      const casContent = "from cas";
      const hash = storeContent(casContent);

      const result = loadContentAuto(inlineContent, hash);
      expect(result).toBe(inlineContent);
    });

    test("returns null when neither available", () => {
      const result = loadContentAuto(null, null);
      expect(result).toBeNull();
    });

    test("handles undefined values", () => {
      const result = loadContentAuto(undefined, undefined);
      expect(result).toBeNull();
    });
  });
});
