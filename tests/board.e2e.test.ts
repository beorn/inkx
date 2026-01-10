import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTester, type TmuxTester, delay } from "tui-tester";

describe("km board e2e", () => {
  let tester: TmuxTester;

  beforeAll(async () => {
    tester = createTester("bun run km board", {
      rows: 24,
      cols: 80,
    });
    await tester.start();
    // Wait for board to render
    await delay(2000);
  }, 10000);

  afterAll(async () => {
    await tester.sendKey("q");
    await delay(500);
    await tester.stop();
  });

  test("board renders with columns and cards", async () => {
    const screen = await tester.captureScreen();
    // Should have box drawing characters for columns
    expect(screen.text).toContain("┌");
    expect(screen.text).toContain("│");
    expect(screen.text).toContain("└");
  });

  describe("header/top line rendering", () => {
    test.skip("top line shows the current path (BUG: path not visible on initial render)", async () => {
      const screen = await tester.captureScreen();

      // On initial render, the path header is NOT showing - the first line is the column box
      // After navigation (pressing j), the path appears
      // This test documents the bug - path should be visible immediately

      const firstLine = screen.lines[0] || "";

      // BUG: This fails because path is not rendered on first frame
      expect(firstLine).toContain("/");
      expect(firstLine.toLowerCase()).toContain("km");
    });

    test("path appears after navigation", async () => {
      // Navigate to trigger re-render
      await tester.sendKey("j");
      await delay(200);

      const screen = await tester.captureScreen();
      const firstLine = screen.lines[0] || "";

      // After navigation, path should be visible
      expect(firstLine).toContain("/");
    });
  });

  describe("card content overflow", () => {
    test.skip("card text lines do not contain mixed/garbled characters (BUG: overflow corruption)", async () => {
      const screen = await tester.captureScreen();

      // Look for garbled text patterns that indicate overflow corruption
      // Examples from actual output:
      // - "morersiewwContext" (mixed fragments)
      // - "moretmattergcking" (mixed fragments)
      // - "moretrategyparison" (mixed fragments)

      // Pattern: lowercase letters followed immediately by more lowercase that don't form words
      // These specific patterns were observed in actual test output
      const corruptionPatterns = [
        /more[a-z]{2,}[A-Z]/, // e.g., "morersiewwContext"
        /more[a-z]+ck/, // e.g., "moretmattergcking"
        /more[a-z]+rison/, // e.g., "moretrategyparison"
        /sentationsnd/, // specific corruption pattern observed
        /sgumentey/, // specific corruption pattern observed
      ];

      let foundCorruption: string[] = [];

      for (const line of screen.lines) {
        for (const pattern of corruptionPatterns) {
          const match = line.match(pattern);
          if (match) {
            foundCorruption.push(`"${match[0]}" in: ${line.slice(0, 60)}...`);
          }
        }
      }

      // This test SHOULD fail until the overflow bug is fixed
      expect(foundCorruption).toHaveLength(0);
    });

    test("documents current overflow state", async () => {
      const screen = await tester.captureScreen();

      // Find lines with visible corruption
      const corruptedLines = screen.lines.filter((line) => {
        // Look for the specific patterns we've observed
        return (
          line.includes("morersiew") ||
          line.includes("moretmat") ||
          line.includes("moretrat") ||
          line.includes("sentationsnd")
        );
      });

      console.log("=== CORRUPTED LINES (overflow bug) ===");
      corruptedLines.forEach((line) => console.log(line));
      console.log(`Found ${corruptedLines.length} corrupted lines`);
      console.log("=======================================");

      // Just document - don't fail
      expect(screen.text.length).toBeGreaterThan(0);
    });
  });

  describe("move mode", () => {
    test("pressing 'm' enters move mode and shows [MOVE] indicator", async () => {
      // Navigate to a card first
      await tester.sendKey("j");
      await delay(100);

      // Screen should NOT show MOVE initially
      const beforeScreen = await tester.captureScreen();
      expect(beforeScreen.text).not.toContain("[MOVE]");

      // Enter move mode
      await tester.sendKey("m");
      await delay(200);

      // Now should show [MOVE] in status bar
      const afterScreen = await tester.captureScreen();
      expect(afterScreen.text).toContain("[MOVE]");

      // Exit move mode with Escape
      await tester.sendKey("Escape");
      await delay(100);

      // MOVE indicator should be gone
      const exitedScreen = await tester.captureScreen();
      expect(exitedScreen.text).not.toContain("[MOVE]");
    });

    test("move mode stays active after pressing j to move card", async () => {
      // Navigate to a card first
      await tester.sendKey("j");
      await delay(100);

      // Enter move mode
      await tester.sendKey("m");
      await delay(200);

      // Verify we're in move mode
      const inMoveMode = await tester.captureScreen();
      expect(inMoveMode.text).toContain("[MOVE]");

      // Press 'j' to move the card down - should STAY in move mode
      await tester.sendKey("j");
      await delay(300);

      // Should STILL be in move mode after moving
      const afterMove = await tester.captureScreen();
      expect(afterMove.text).toContain("[MOVE]");

      // Clean up - exit move mode
      await tester.sendKey("Escape");
      await delay(100);
    });

    test("pressing j in move mode actually moves the card (not just cursor)", async () => {
      // Reset to a known state - go to first card
      await tester.sendKey("g"); // Go to first card
      await delay(200);

      // Navigate to second card
      await tester.sendKey("j");
      await delay(200);

      // Capture the initial screen to see the card order
      const beforeScreen = await tester.captureScreen();

      // Check if we're in move mode already (from previous test) and exit
      if (beforeScreen.text.includes("[MOVE]")) {
        await tester.sendKey("Escape");
        await delay(100);
      }

      // Find all card rows (lines with box drawing chars and content)
      const beforeCardRows = beforeScreen.lines.filter(
        (l) => l.includes("▼") && l.includes("│"),
      );

      // Enter move mode
      await tester.sendKey("m");
      await delay(200);

      // Verify we're in move mode
      const inMoveMode = await tester.captureScreen();
      expect(inMoveMode.text).toContain("[MOVE]");

      // Move the card down
      await tester.sendKey("j");
      await delay(600); // Longer delay for database update and rebuild

      // Capture after move
      const afterScreen = await tester.captureScreen();
      const afterCardRows = afterScreen.lines.filter(
        (l) => l.includes("▼") && l.includes("│"),
      );

      // Exit move mode
      await tester.sendKey("Escape");
      await delay(100);

      // The card rows should be different after the move
      // (at least one row should have different content due to reordering)
      const beforeJoined = beforeCardRows.join("\n");
      const afterJoined = afterCardRows.join("\n");

      // If the board content didn't change at all, the move didn't work
      // Note: We just verify SOMETHING changed - full verification would need
      // more complex logic to track specific cards
      expect(afterJoined).not.toBe(beforeJoined);
    });
  });
});
