/**
 * Test that useScreenRectCallback is actually called with correct Y positions
 * when rendering cards in a column.
 *
 * This is a minimal integration test to verify the inkx hook works.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import React, { useCallback, useRef } from "react";
import { createTestRenderer, normalizeFrame } from "inkx/testing";
import { Box, Text, useScreenRectCallback } from "inkx";

const render = createTestRenderer({ columns: 80, rows: 24 });

interface RecordedPosition {
  id: string;
  y: number;
  height: number;
}

/**
 * Component that records its screen position when rendered.
 */
function PositionRecorder({
  id,
  onLayout,
}: {
  id: string;
  onLayout: (pos: RecordedPosition) => void;
}) {
  const handleLayout = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      onLayout({ id, y: rect.y, height: rect.height });
    },
    [id, onLayout],
  );

  useScreenRectCallback(handleLayout);
  return null;
}

/**
 * Card with border that contains a PositionRecorder.
 */
function Card({
  id,
  content,
  onLayout,
}: {
  id: string;
  content: string;
  onLayout: (pos: RecordedPosition) => void;
}) {
  return (
    <Box borderStyle="single" flexDirection="column">
      <PositionRecorder id={id} onLayout={onLayout} />
      <Text>{content}</Text>
    </Box>
  );
}

describe("useScreenRectCallback integration", () => {
  test("callbacks are called for each card", () => {
    const positions: RecordedPosition[] = [];
    const onLayout = (pos: RecordedPosition) => {
      positions.push(pos);
    };

    const { lastFrameText } = render(
      <Box flexDirection="column">
        <Card id="card-1" content="First Card" onLayout={onLayout} />
        <Card id="card-2" content="Second Card" onLayout={onLayout} />
        <Card id="card-3" content="Third Card" onLayout={onLayout} />
      </Box>,
    );

    // Verify rendering
    const text = lastFrameText()!;
    expect(text).toContain("First Card");
    expect(text).toContain("Second Card");
    expect(text).toContain("Third Card");

    // Verify positions were recorded
    expect(positions.length).toBe(3);
    expect(positions.map((p) => p.id)).toEqual(["card-1", "card-2", "card-3"]);
  });

  test("stacked cards have increasing Y positions", () => {
    const positions: RecordedPosition[] = [];
    const onLayout = (pos: RecordedPosition) => {
      positions.push(pos);
    };

    render(
      <Box flexDirection="column">
        <Card id="card-1" content="A" onLayout={onLayout} />
        <Card id="card-2" content="B" onLayout={onLayout} />
        <Card id="card-3" content="C" onLayout={onLayout} />
      </Box>,
    );

    // Sort by Y to ensure consistent ordering
    positions.sort((a, b) => a.y - b.y);

    // Each card should have a larger Y than the previous
    // (stacked vertically means increasing Y)
    expect(positions[0].y).toBeLessThan(positions[1].y);
    expect(positions[1].y).toBeLessThan(positions[2].y);

    // Log actual values for debugging
    console.log("Card positions:", positions);
  });

  test("cards in same row have same Y position", () => {
    const positions: RecordedPosition[] = [];
    const onLayout = (pos: RecordedPosition) => {
      positions.push(pos);
    };

    render(
      <Box flexDirection="row">
        <Card id="left" content="Left" onLayout={onLayout} />
        <Card id="right" content="Right" onLayout={onLayout} />
      </Box>,
    );

    // Cards in a row should have the same Y
    const leftPos = positions.find((p) => p.id === "left")!;
    const rightPos = positions.find((p) => p.id === "right")!;

    expect(leftPos.y).toBe(rightPos.y);
  });
});
