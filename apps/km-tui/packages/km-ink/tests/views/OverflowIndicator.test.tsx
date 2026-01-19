/**
 * OverflowIndicator Component Tests
 *
 * Tests the unified overflow indicator used by all views.
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { OverflowIndicator } from "../../src/views/OverflowIndicator.tsx";

describe("OverflowIndicator", () => {
  it("returns null when count is 0", () => {
    const { lastFrame } = render(
      <OverflowIndicator direction="down" count={0} />,
    );
    expect(lastFrame()).toBe("");
  });

  it("returns null when count is negative", () => {
    const { lastFrame } = render(
      <OverflowIndicator direction="down" count={-5} />,
    );
    expect(lastFrame()).toBe("");
  });

  it("shows down arrow with count for direction down", () => {
    const { lastFrame } = render(
      <OverflowIndicator direction="down" count={5} />,
    );
    expect(lastFrame()).toContain("▼");
    expect(lastFrame()).toContain("5 more");
  });

  it("shows up arrow with count for direction up", () => {
    const { lastFrame } = render(
      <OverflowIndicator direction="up" count={3} />,
    );
    expect(lastFrame()).toContain("▲");
    expect(lastFrame()).toContain("3 more");
  });

  it("centers text when width is provided", () => {
    const { lastFrame } = render(
      <OverflowIndicator direction="down" count={5} width={30} />,
    );
    const frame = lastFrame() || "";
    // "▼ 5 more" is 8 chars, so with width 30 it should have left padding
    // Note: ink-testing-library may strip trailing whitespace
    expect(frame.startsWith(" ")).toBe(true);
    expect(frame).toContain("▼ 5 more");
    // Should have roughly 11 spaces of left padding ((30 - 8) / 2 = 11)
    const match = frame.match(/^(\s*)/);
    const leadingSpaces = match?.[1]?.length ?? 0;
    expect(leadingSpaces).toBeGreaterThanOrEqual(10);
  });

  it("does not center when width is too narrow", () => {
    const { lastFrame } = render(
      <OverflowIndicator direction="down" count={5} width={5} />,
    );
    const frame = lastFrame() || "";
    // Width is less than text, so no padding should be applied
    expect(frame).toBe("▼ 5 more");
  });

  it("handles large counts", () => {
    const { lastFrame } = render(
      <OverflowIndicator direction="down" count={999} />,
    );
    expect(lastFrame()).toContain("▼");
    expect(lastFrame()).toContain("999 more");
  });

  it("works without width prop", () => {
    const { lastFrame } = render(
      <OverflowIndicator direction="up" count={10} />,
    );
    expect(lastFrame()).toBe("▲ 10 more");
  });
});
