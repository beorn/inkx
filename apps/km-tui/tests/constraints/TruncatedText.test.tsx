/**
 * TruncatedText Component Tests
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { createTestRenderer } from "inkx/testing";

const render = createTestRenderer();
import { Box, Text } from "inkx";
import {
  TruncatedText,
  useTruncatedText,
  ConstraintRoot,
} from "../../src/constraints/index.ts";

describe("TruncatedText", () => {
  it("renders short text unchanged with explicit width", () => {
    const { lastFrame } = render(
      <TruncatedText width={20}>hello</TruncatedText>,
    );
    expect(lastFrame()).toBe("hello");
  });

  it("truncates long text with explicit width", () => {
    const { lastFrame } = render(
      <TruncatedText width={10}>this is a long text</TruncatedText>,
    );
    // Should truncate to ~10 chars with ellipsis
    expect(lastFrame()?.length).toBeLessThanOrEqual(10);
    expect(lastFrame()).toContain("…");
  });

  it("respects maxLines parameter", () => {
    const longText = "line one that is long\nline two also long\nline three";
    const { lastFrame } = render(
      <TruncatedText width={30} maxLines={2}>
        {longText}
      </TruncatedText>,
    );
    const lines = lastFrame()?.split("\n") || [];
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("uses custom ellipsis", () => {
    const { lastFrame } = render(
      <TruncatedText width={10} ellipsis="...">
        this is a long text
      </TruncatedText>,
    );
    expect(lastFrame()).toContain("...");
    expect(lastFrame()).not.toContain("…");
  });

  it("works inside ConstraintRoot with no explicit width", () => {
    // When inside ConstraintRoot, it should pick up width from context
    // Note: ink-testing-library doesn't set up a real TTY, so terminal size
    // defaults to 80x24, giving us plenty of room
    const { lastFrame } = render(
      <ConstraintRoot>
        <TruncatedText>short text</TruncatedText>
      </ConstraintRoot>,
    );
    expect(lastFrame()).toBe("short text");
  });

  it("handles empty string", () => {
    const { lastFrame } = render(
      <TruncatedText width={10}>{""}</TruncatedText>,
    );
    expect(lastFrame()).toBe("");
  });

  it("handles ANSI-styled text", () => {
    // ANSI codes shouldn't count toward display length
    const styled = "\x1b[31mred\x1b[0m text";
    const { lastFrame } = render(
      <TruncatedText width={20}>{styled}</TruncatedText>,
    );
    // Should contain the ANSI codes
    expect(lastFrame()).toContain("\x1b[31m");
  });
});

describe("useTruncatedText hook", () => {
  // Test component that uses the hook
  function HookTestComponent({
    text,
    width,
    maxLines,
  }: {
    text: string;
    width: number;
    maxLines?: number;
  }) {
    const { lines, truncated } = useTruncatedText(text, { width, maxLines });
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
        {truncated && <Text>TRUNCATED</Text>}
      </Box>
    );
  }

  it("returns lines and truncation status", () => {
    const { lastFrame } = render(
      <HookTestComponent text="one two three four" width={10} maxLines={1} />,
    );
    expect(lastFrame()).toContain("TRUNCATED");
  });

  it("returns truncated=false for short text", () => {
    const { lastFrame } = render(
      <HookTestComponent text="short" width={20} maxLines={5} />,
    );
    expect(lastFrame()).not.toContain("TRUNCATED");
  });
});
