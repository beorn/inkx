import { describe, test, expect } from "bun:test";
import {
  generateShortId,
  generateCustomId,
  generateSubId,
} from "../src/short-ids.ts";

describe("Short ID utilities", () => {
  test("generateShortId produces km-xxxx format", () => {
    const id = generateShortId();
    expect(id).toMatch(/^km-[a-z0-9]{4}$/);
  });

  test("generateCustomId adds prefix", () => {
    const id = generateCustomId("auth-epic");
    expect(id).toBe("km-auth-epic");
  });

  test("generateSubId creates parent.N format", () => {
    const id = generateSubId("km-auth-epic", 1);
    expect(id).toBe("km-auth-epic.1");
  });

  test("generates unique IDs", () => {
    const ids = new Set([
      generateShortId(),
      generateShortId(),
      generateShortId(),
    ]);
    expect(ids.size).toBe(3);
  });
});
