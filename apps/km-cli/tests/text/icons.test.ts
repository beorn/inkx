/**
 * Tests for icon utilities (Layer 1)
 */

import { describe, it, expect } from "bun:test";
import {
  getStatusIcon,
  getTypeIcon,
  type StatusIcon,
} from "../../src/text/icons.ts";

describe("getStatusIcon", () => {
  it("returns gray circle for open/todo", () => {
    const icon = getStatusIcon("open");
    expect(icon.char).toBe("○");
    expect(icon.color).toBe("gray");
  });

  it("returns green checkmark for done", () => {
    const icon = getStatusIcon("done");
    expect(icon.char).toBe("✓");
    expect(icon.color).toBe("green");
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

  it("returns blue clock for waiting", () => {
    const icon = getStatusIcon("waiting");
    expect(icon.char).toBe("◷");
    expect(icon.color).toBe("blue");
  });

  it("returns gray empty set for dropped", () => {
    const icon = getStatusIcon("dropped");
    expect(icon.char).toBe("∅");
    expect(icon.color).toBe("gray");
  });

  it("handles null as open", () => {
    const icon = getStatusIcon(null);
    expect(icon.char).toBe("○");
    expect(icon.color).toBe("gray");
  });

  it("handles undefined as open", () => {
    const icon = getStatusIcon(undefined);
    expect(icon.char).toBe("○");
    expect(icon.color).toBe("gray");
  });

  it("handles unknown status as open", () => {
    const icon = getStatusIcon("unknown");
    expect(icon.char).toBe("○");
    expect(icon.color).toBe("gray");
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

  it("returns backtick for code", () => {
    expect(getTypeIcon("code")).toBe("`");
  });

  it("returns quote mark for quote", () => {
    expect(getTypeIcon("quote")).toBe('"');
  });

  it("returns middle dot for unknown types", () => {
    expect(getTypeIcon("unknown")).toBe("·");
  });

  it("returns middle dot for list items", () => {
    expect(getTypeIcon("list-item")).toBe("·");
  });
});
