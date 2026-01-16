/**
 * Tests for icon utilities (Layer 1)
 */

import { describe, it, expect } from "bun:test";
import { getStatusIcon, getTypeIcon, type StatusIcon } from "@km/tui-core";

describe("getStatusIcon", () => {
  // Actual statuses from km-core: todo, wip, blocked, done, dropped

  it("returns gray circle for todo", () => {
    const icon = getStatusIcon("todo");
    expect(icon.char).toBe("○");
    expect(icon.color).toBe("gray");
  });

  it("returns yellow half circle for wip", () => {
    const icon = getStatusIcon("wip");
    expect(icon.char).toBe("◐");
    expect(icon.color).toBe("yellow");
  });

  it("returns red circled slash for blocked", () => {
    const icon = getStatusIcon("blocked");
    expect(icon.char).toBe("⊘");
    expect(icon.color).toBe("red");
  });

  it("returns green checkmark for done", () => {
    const icon = getStatusIcon("done");
    expect(icon.char).toBe("✓");
    expect(icon.color).toBe("green");
  });

  it("returns gray empty set for dropped", () => {
    const icon = getStatusIcon("dropped");
    expect(icon.char).toBe("∅");
    expect(icon.color).toBe("gray");
  });

  it("returns red warning triangle for null (missing status)", () => {
    const icon = getStatusIcon(null);
    expect(icon.char).toBe("⚠");
    expect(icon.color).toBe("red");
    expect(icon.backgroundColor).toBeUndefined();
  });

  it("returns red warning triangle for undefined (missing status)", () => {
    const icon = getStatusIcon(undefined);
    expect(icon.char).toBe("⚠");
    expect(icon.color).toBe("red");
    expect(icon.backgroundColor).toBeUndefined();
  });

  it("returns first char with inverted colors for unrecognized status", () => {
    const icon = getStatusIcon("invalid");
    expect(icon.char).toBe("i"); // first char of "invalid"
    expect(icon.color).toBe("black");
    expect(icon.backgroundColor).toBe("white");
  });

  it("returns first char with inverted colors for custom status", () => {
    const icon = getStatusIcon("x");
    expect(icon.char).toBe("x");
    expect(icon.color).toBe("black");
    expect(icon.backgroundColor).toBe("white");
  });
});

describe("getTypeIcon", () => {
  it("returns folder emoji for folder", () => {
    expect(getTypeIcon("folder")).toBe("📁");
  });

  it("returns file emoji for file", () => {
    expect(getTypeIcon("file")).toBe("📄");
  });

  it("returns hash for section", () => {
    expect(getTypeIcon("section")).toBe("#");
  });

  it("returns empty string for paragraph", () => {
    expect(getTypeIcon("paragraph")).toBe("");
  });

  it("returns empty for code (rich text handles it)", () => {
    expect(getTypeIcon("code")).toBe("");
  });

  it("returns empty for quote (rich text handles it)", () => {
    expect(getTypeIcon("quote")).toBe("");
  });

  it("returns middle dot for unknown types", () => {
    expect(getTypeIcon("unknown")).toBe("·");
  });

  it("returns middle dot for list items", () => {
    expect(getTypeIcon("list-item")).toBe("·");
  });
});
